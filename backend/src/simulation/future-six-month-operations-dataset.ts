import {
  TechnicianEmploymentType,
  TechnicianServiceReviewStatus,
  type Prisma,
  type PrismaClient
} from "@prisma/client";

import {
  FUTURE_OPERATIONS_END_EXCLUSIVE_AT,
  FUTURE_OPERATIONS_NAMESPACE,
  FUTURE_OPERATIONS_START_AT,
  type FutureOperationsCohort,
  type FutureOperationsPlan
} from "./future-six-month-operations-plan";
import { buildThreeMonthSimulationPlan } from "./three-month-simulation-plan";

export type FutureOperationsReadClient = Pick<
  PrismaClient,
  | "user"
  | "customerProfile"
  | "technicianProfile"
  | "technicianService"
  | "availability"
  | "scheduleSlot"
  | "bookingOrder"
>;

export interface FutureOperationsInspection {
  activeAvailabilities: number;
  activeSlots: number;
  namespacedBookings: number;
  conflictingBookings: number;
}

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message
) => {
  if (!condition) {
    throw new Error(message);
  }
};

const readJsonRecord = (value: Prisma.JsonValue | null): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const toFulfillmentMode = (value: string): "store" | "home_visit" => {
  if (value !== "store" && value !== "home_visit") {
    throw new Error(`Unsupported service mode: ${value}`);
  }
  return value;
};

export const loadFutureOperationsCohort = async (
  prisma: FutureOperationsReadClient
): Promise<FutureOperationsCohort> => {
  const inventory = buildThreeMonthSimulationPlan();
  const technicianByEmail = new Map(
    inventory.technicians.map((technician) => [technician.email, technician])
  );
  const customerByEmail = new Map(
    inventory.customers.map((customer) => [customer.email, customer])
  );
  const emails = [...technicianByEmail.keys(), ...customerByEmail.keys()];
  const users = await prisma.user.findMany({
    where: {
      email: { in: emails },
      isActive: true,
      deletedAt: null
    },
    select: { id: true, email: true }
  });
  assert(users.length === 200, `Expected 200 existing test users, found ${users.length}.`);

  const userIdByEmail = new Map(users.map((user) => [user.email, user.id]));
  const customerUserIds = inventory.customers.map((customer) => {
    const userId = userIdByEmail.get(customer.email);
    assert(userId !== undefined, `Existing customer account is missing: ${customer.email}`);
    return userId;
  });
  const customerProfiles = await prisma.customerProfile.findMany({
    where: { userId: { in: customerUserIds }, deletedAt: null },
    select: { userId: true }
  });
  assert(
    customerProfiles.length === 100,
    `Expected 100 existing customer profiles, found ${customerProfiles.length}.`
  );
  const customerProfileUserIds = new Set(customerProfiles.map((profile) => profile.userId));

  const technicianUserIds = inventory.technicians.map((technician) => {
    const userId = userIdByEmail.get(technician.email);
    assert(userId !== undefined, `Existing technician account is missing: ${technician.email}`);
    return userId;
  });
  const technicianProfiles = await prisma.technicianProfile.findMany({
    where: {
      userId: { in: technicianUserIds },
      status: "published",
      deletedAt: null
    },
    select: {
      id: true,
      userId: true,
      shopId: true,
      employmentType: true,
      shop: {
        select: {
          id: true,
          ownerUserId: true,
          status: true,
          deletedAt: true
        }
      }
    }
  });
  assert(
    technicianProfiles.length === 100,
    `Expected 100 existing technician profiles, found ${technicianProfiles.length}.`
  );

  const technicianProfileIds = technicianProfiles.map((profile) => profile.id);
  const technicianServices = await prisma.technicianService.findMany({
    where: {
      technicianId: { in: technicianProfileIds },
      isActive: true,
      isBookable: true,
      reviewStatus: TechnicianServiceReviewStatus.APPROVED,
      deletedAt: null
    },
    select: {
      id: true,
      technicianId: true,
      shopId: true,
      sourceShopServiceId: true,
      name: true,
      durationMinutes: true,
      priceAmount: true,
      sourceShopService: {
        select: {
          id: true,
          shopId: true,
          serviceMode: true,
          status: true,
          deletedAt: true
        }
      }
    }
  });
  assert(
    technicianServices.length === 100,
    `Expected 100 active technician services, found ${technicianServices.length}.`
  );

  const profileByUserId = new Map(
    technicianProfiles.map((profile) => [profile.userId, profile])
  );
  const servicesByTechnicianId = new Map<
    number,
    (typeof technicianServices)[number][]
  >();
  for (const service of technicianServices) {
    servicesByTechnicianId.set(service.technicianId, [
      ...(servicesByTechnicianId.get(service.technicianId) ?? []),
      service
    ]);
  }

  const technicians = inventory.technicians.map((technician) => {
    const userId = userIdByEmail.get(technician.email);
    assert(userId !== undefined, `Existing technician account is missing: ${technician.email}`);
    const profile = profileByUserId.get(userId);
    assert(profile, `Existing technician profile is missing: ${technician.email}`);
    assert(
      profile.shopId !== null &&
        profile.shop?.id === profile.shopId &&
        profile.shop.ownerUserId !== null &&
        profile.shop.status === "published" &&
        profile.shop.deletedAt === null,
      `Active shop relation is missing: ${technician.email}`
    );
    assert(
      profile.employmentType === TechnicianEmploymentType.FULL_TIME ||
        profile.employmentType === TechnicianEmploymentType.TEMPORARY,
      `Unsupported employment type: ${technician.email}`
    );
    const assignments = servicesByTechnicianId.get(profile.id) ?? [];
    assert(
      assignments.length === 1,
      `Expected one active bookable technician service: ${technician.email}`
    );
    const assignment = assignments[0]!;
    const source = assignment.sourceShopService;
    assert(
      assignment.shopId === profile.shopId &&
        assignment.sourceShopServiceId !== null &&
        source?.id === assignment.sourceShopServiceId &&
        source.shopId === profile.shopId &&
        source.status === "published" &&
        source.deletedAt === null,
      `Cross-shop or inactive service relation: ${technician.email}`
    );
    const fulfillmentMode = toFulfillmentMode(source.serviceMode);
    assert(
      assignment.durationMinutes > 0 && assignment.priceAmount > 0,
      `Invalid technician service terms: ${technician.email}`
    );

    return {
      key: technician.key,
      userId,
      technicianProfileId: profile.id,
      shopId: profile.shopId,
      shopOwnerUserId: profile.shop.ownerUserId,
      serviceId: source.id,
      technicianServiceId: assignment.id,
      employmentType: profile.employmentType,
      serviceName: assignment.name,
      durationMinutes: assignment.durationMinutes,
      priceAmountJpy: assignment.priceAmount,
      fulfillmentMode
    };
  });

  const customers = inventory.customers.map((customer) => {
    const userId = userIdByEmail.get(customer.email);
    assert(userId !== undefined, `Existing customer account is missing: ${customer.email}`);
    assert(customerProfileUserIds.has(userId), `Existing customer profile is missing: ${customer.email}`);
    return { key: customer.key, userId };
  });

  return { customers, technicians };
};

export const inspectFutureOperationsWindow = async (
  prisma: FutureOperationsReadClient,
  plan: FutureOperationsPlan
): Promise<FutureOperationsInspection> => {
  const technicianProfileIds = [
    ...new Set(plan.slots.map((slot) => slot.technicianProfileId))
  ];
  const startsAt = {
    gte: new Date(FUTURE_OPERATIONS_START_AT),
    lt: new Date(FUTURE_OPERATIONS_END_EXCLUSIVE_AT)
  };
  const [activeAvailabilities, activeSlots, bookings] = await Promise.all([
    prisma.availability.count({
      where: {
        technicianProfileId: { in: technicianProfileIds },
        startsAt,
        deletedAt: null
      }
    }),
    prisma.scheduleSlot.count({
      where: {
        technicianProfileId: { in: technicianProfileIds },
        startsAt,
        deletedAt: null
      }
    }),
    prisma.bookingOrder.findMany({
      where: {
        technicianProfileId: { in: technicianProfileIds },
        startsAt,
        deletedAt: null
      },
      select: { serviceSnapshotJson: true }
    })
  ]);
  const namespacedBookings = bookings.filter(
    (booking) =>
      readJsonRecord(booking.serviceSnapshotJson)?.namespace === FUTURE_OPERATIONS_NAMESPACE
  ).length;

  return {
    activeAvailabilities,
    activeSlots,
    namespacedBookings,
    conflictingBookings: bookings.length - namespacedBookings
  };
};
