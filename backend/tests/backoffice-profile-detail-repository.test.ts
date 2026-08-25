import type { PrismaClient } from "@prisma/client";
import { BackofficeRepository } from "../src/repositories/backoffice.repository";

const date = (value: string) => new Date(value);
const money = (value: number) => ({ toString: () => String(value) });

interface FixtureOptions {
  auditRows?: unknown[];
  legacyServices?: unknown[];
  scheduleSlots?: unknown[];
  technicianServices?: unknown[];
}

const booking = (id: number, status: string, shopId = 11) => ({
  id,
  orderNo: `ND20260825${id}`,
  status,
  paymentStatus: "CONFIRMED",
  customerUserId: 51,
  customer: { username: "Customer", email: "customer@example.com" },
  serviceId: 71,
  serviceNameSnapshot: "Formal care",
  service: { name: "Formal care" },
  shopId,
  shop: { name: "Aoyama Care Studio" },
  technicianProfileId: 31,
  technicianProfile: { displayName: "Technician" },
  fulfillmentMode: "store",
  priceAmount: money(9000),
  currency: "JPY",
  startsAt: date("2026-08-26T01:00:00.000Z"),
  endsAt: date("2026-08-26T02:00:00.000Z"),
  note: null,
  cancelReason: null,
  createdAt: date("2026-08-25T01:00:00.000Z"),
  updatedAt: date("2026-08-25T01:00:00.000Z")
});

function createClient(withTechnicianReview = true, options: FixtureOptions = {}) {
  const technician = {
    id: 31,
    userId: 61,
    displayName: "Technician",
    bio: "Formal technician profile",
    city: "Tokyo",
    serviceArea: "Minato",
    yearsExperience: 8,
    status: "published",
    isRecommended: true,
    verifiedAt: date("2026-08-01T00:00:00.000Z"),
    createdAt: date("2026-08-01T00:00:00.000Z"),
    updatedAt: date("2026-08-24T00:00:00.000Z"),
    shopId: 11,
    shop: { name: "Aoyama Care Studio" },
    reviewSummary: withTechnicianReview
      ? {
          ratingAverage: money(4.8),
          reviewCount: 12,
          latestReviewAt: date("2026-08-20T00:00:00.000Z"),
          highlights: ["Careful"],
          deletedAt: null
        }
      : null,
    user: {
      username: "Technician account",
      email: "technician@example.com",
      phone: null,
      avatarUrl: null,
      isActive: true,
      lastLoginAt: date("2026-08-20T00:00:00.000Z"),
      userRoles: [
        {
          scopeType: "shop",
          scopeId: 11,
          role: { name: "Technician", code: "technician" }
        },
        {
          scopeType: "technician_profile",
          scopeId: 31,
          role: { name: "Technician", code: "technician" }
        }
      ],
      identities: [
        { type: "technician", scopeType: "shop", scopeId: 11, displayName: "Technician" },
        {
          type: "technician",
          scopeType: "technician_profile",
          scopeId: 31,
          displayName: "Technician profile"
        },
        {
          type: "technician",
          scopeType: "technician_profile",
          scopeId: 32,
          displayName: "Other technician profile"
        }
      ]
    }
  };
  const customer = {
    id: 41,
    userId: 51,
    displayName: "Customer",
    bio: "Formal customer profile",
    city: "Tokyo",
    membershipLevel: "standard",
    isPublic: true,
    createdAt: date("2026-08-01T00:00:00.000Z"),
    updatedAt: date("2026-08-24T00:00:00.000Z"),
    reviewSummary: null,
    user: {
      username: "Customer account",
      email: "customer@example.com",
      phone: null,
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null,
      userRoles: [
        { scopeType: "shop", scopeId: 11, role: { name: "Customer", code: "customer" } },
        {
          scopeType: "customer_profile",
          scopeId: 41,
          role: { name: "Customer", code: "customer" }
        },
        { scopeType: "shop", scopeId: 22, role: { name: "Other shop", code: "other" } }
      ],
      identities: [
        { type: "customer", scopeType: "global", scopeId: null, displayName: "Customer" },
        {
          type: "customer",
          scopeType: "customer_profile",
          scopeId: 41,
          displayName: "Customer profile"
        },
        {
          type: "customer",
          scopeType: "customer_profile",
          scopeId: 42,
          displayName: "Other customer profile"
        }
      ]
    }
  };
  const client = {
    technicianProfile: { findFirst: jest.fn(async () => technician) },
    customerProfile: { findFirst: jest.fn(async () => customer) },
    bookingOrder: {
      groupBy: jest.fn(async () => [
        { status: "COMPLETED", _count: { _all: 2 } },
        { status: "CANCELLED", _count: { _all: 1 } }
      ]),
      aggregate: jest.fn(async () => ({ _sum: { priceAmount: money(18000) } })),
      findMany: jest.fn(async (input: { where?: { startsAt?: { gte?: Date }; status?: { in?: string[] } } }) => {
        if (input.where?.startsAt?.gte) {
          return input.where.status?.in
            ? [booking(4, "CONFIRMED")]
            : [booking(3, "COMPLETED"), booking(4, "CONFIRMED")];
        }
        return [booking(1, "COMPLETED"), booking(2, "CONFIRMED")];
      })
    },
    scheduleSlot: {
      findMany: jest.fn(async (input: { select?: unknown }) =>
        input.select ? (options.scheduleSlots ?? []) : []
      )
    },
    technicianService: { findMany: jest.fn(async () => options.technicianServices ?? []) },
    service: { findMany: jest.fn(async () => options.legacyServices ?? []) },
    technicianCompensationProfile: { findFirst: jest.fn(async () => null) },
    auditLog: { findMany: jest.fn(async () => options.auditRows ?? []) }
  };

  return { client: client as unknown as Pick<PrismaClient, keyof typeof client> };
}

describe("BackofficeRepository profile details", () => {
  it("maps only formal technician detail records inside merchant scope", async () => {
    const { client } = createClient();
    const repository = new BackofficeRepository(client as PrismaClient);

    const detail = await repository.getTechnicianDetail({ scope: "merchant", shopId: 11, id: 31 });

    expect(client.technicianProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 31, shopId: 11, deletedAt: null } })
    );
    expect(detail).toMatchObject({
      id: 31,
      account: { email: "technician@example.com", isActive: true },
      statistics: { bookingCount: 3, completedCount: 2, completedRevenueJpy: 18000 },
      reviewSummary: { ratingAverage: 4.8, reviewCount: 12 },
      unavailableMetrics: ["acceptanceRate", "lateness", "shiftPreferences"]
    });
  });

  it("limits merchant customer bookings, totals, roles, identities, and timeline to its shop", async () => {
    const { client } = createClient();
    const repository = new BackofficeRepository(client as PrismaClient);

    const detail = await repository.getCustomerDetail({ scope: "merchant", shopId: 11, id: 41 });

    expect(client.bookingOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ customerUserId: 51, shopId: 11 }) })
    );
    expect(client.customerProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 41,
        user: expect.objectContaining({
          bookingOrders: { some: { shopId: 11, deletedAt: null } }
        })
      })
    }));
    expect(detail?.recentBookings).toHaveLength(2);
    expect(detail?.account.roles).toEqual(expect.arrayContaining([
      expect.objectContaining({ scopeType: "shop", scopeId: 11 })
    ]));
  });

  it("keeps only merchant-safe shop and formal profile identities for seed-compatible accounts", async () => {
    const { client } = createClient();
    const repository = new BackofficeRepository(client as PrismaClient);

    const technician = await repository.getTechnicianDetail({ scope: "merchant", shopId: 11, id: 31 });
    const customer = await repository.getCustomerDetail({ scope: "merchant", shopId: 11, id: 41 });

    expect(technician?.account.identities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scopeType: "technician_profile", scopeId: 31 })
    ]));
    expect(technician?.account.identities).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ scopeType: "technician_profile", scopeId: 32 })
    ]));
    expect(customer?.account.identities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scopeType: "customer_profile", scopeId: 41 })
    ]));
    expect(customer?.account.identities).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ scopeType: "customer_profile", scopeId: 42 })
    ]));
  });

  it("maps established technician audit metadata while enforcing merchant shop scope", async () => {
    const auditRow = {
      id: 91,
      action: "merchant_admin.technician.update",
      metadata: { technicianId: 31, shopId: 11, changedFields: ["city"] },
      createdAt: date("2026-08-25T02:00:00.000Z"),
      actor: { username: "Aoyama Owner", avatarUrl: "/owner.png" }
    };
    const { client } = createClient(true, { auditRows: [auditRow] });
    const repository = new BackofficeRepository(client as PrismaClient);

    const detail = await repository.getTechnicianDetail({ scope: "merchant", shopId: 11, id: 31 });

    expect(detail?.timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "91",
        action: "merchant_admin.technician.update",
        actorName: "Aoyama Owner",
        metadata: auditRow.metadata
      })
    ]));
    expect(client.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({ metadata: { path: "$.shopId", equals: 11 } }),
          expect.objectContaining({
            OR: expect.arrayContaining([
              { metadata: { path: "$.technicianId", equals: 31 } }
            ])
          })
        ])
      }),
      take: 30
    }));
  });

  it("uses the union of the current UTC week and month for schedule intersections", async () => {
    jest.useFakeTimers().setSystemTime(date("2026-09-01T12:00:00.000Z"));
    const crossingWeekSlot = {
      startsAt: date("2026-08-31T22:00:00.000Z"),
      endsAt: date("2026-08-31T23:00:00.000Z")
    };
    try {
      const { client } = createClient(true, { scheduleSlots: [crossingWeekSlot] });
      const repository = new BackofficeRepository(client as PrismaClient);

      const detail = await repository.getTechnicianDetail({ scope: "merchant", shopId: 11, id: 31 });

      expect(detail?.statistics).toMatchObject({
        todayScheduleMinutes: 0,
        weekScheduleMinutes: 60,
        monthScheduleMinutes: 0
      });
      expect(client.scheduleSlot.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ endsAt: { gt: date("2026-08-31T00:00:00.000Z") } })
      }));
    } finally {
      jest.useRealTimers();
    }
  });

  it("excludes future terminal bookings from the next customer booking", async () => {
    const { client } = createClient();
    const repository = new BackofficeRepository(client as PrismaClient);

    const detail = await repository.getCustomerDetail({ scope: "merchant", shopId: 11, id: 41 });

    expect(detail?.nextBooking).toMatchObject({ id: 4, status: "confirmed" });
    expect(client.bookingOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ["PENDING", "CONFIRMED", "IN_SERVICE"] } }),
      take: 1
    }));
  });

  it("uses explicit safe account selects and returns bounded, deduplicated formal detail sections", async () => {
    const technicianService = {
      id: 81,
      sourceShopServiceId: 71,
      name: "Technician formal care",
      description: null,
      categoryId: 7,
      priceAmount: 9000,
      currency: "JPY",
      durationMinutes: 60,
      isRecommended: false
    };
    const legacyService = {
      id: 71,
      name: "Legacy formal care",
      description: null,
      categoryId: 7,
      priceAmount: money(9000),
      currency: "JPY",
      durationMinutes: 60,
      isRecommended: false
    };
    const { client } = createClient(true, {
      technicianServices: [technicianService],
      legacyServices: [legacyService]
    });
    const repository = new BackofficeRepository(client as PrismaClient);

    const detail = await repository.getTechnicianDetail({ scope: "merchant", shopId: 11, id: 31 });
    const profileQuery = (client.technicianProfile.findFirst as unknown as jest.Mock).mock.calls[0]?.[0];

    expect(profileQuery.include.user.select).toEqual(expect.objectContaining({
      username: true,
      email: true,
      phone: true,
      avatarUrl: true
    }));
    expect(profileQuery.include.user.select).not.toHaveProperty("passwordHash");
    expect(detail?.services).toHaveLength(1);
    expect(detail?.upcomingSchedule).toHaveLength(0);
    expect(client.scheduleSlot.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 12 }));
    expect(client.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 30 }));
  });

  it("returns null formal sections without inventing compensation, reviews, or schedule", async () => {
    const { client } = createClient(false);
    const repository = new BackofficeRepository(client as PrismaClient);

    const detail = await repository.getTechnicianDetail({ scope: "merchant", shopId: 11, id: 31 });

    expect(detail).toMatchObject({
      compensationProfile: null,
      reviewSummary: null,
      upcomingSchedule: []
    });
  });
});
