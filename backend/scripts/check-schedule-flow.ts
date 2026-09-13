import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  assert(process.env.NODE_ENV !== "production", "schedule integration check cannot use NODE_ENV=production");
  assert(process.env.DEPLOY_ENV !== "prod", "schedule integration check cannot use DEPLOY_ENV=prod");
  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  assert(
    databaseUrl.hostname === "localhost" || databaseUrl.hostname === "127.0.0.1",
    "schedule integration check only accepts a local MySQL host"
  );
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");

  const [
    { BackofficeRepository },
    { BookingRepository },
    { verifyShopServiceLocationInTransaction },
    { prisma, disconnectPrisma },
    { createFormalTestUser, deleteFormalTestUserFoundations }
  ] = await Promise.all([
    import("../src/repositories/backoffice.repository"),
    import("../src/repositories/booking.repository"),
    import("../src/repositories/shop-service-location.repository"),
    import("../src/prisma/client"),
    import("./support/formal-test-user")
  ]);
  const marker = `${Date.now()}-${process.pid}`;
  const passwordHash = await hash("ScheduleFlow.2026!", 12);
  const createdUserIds: number[] = [];
  const createdSlotIds: number[] = [];
  const createdAvailabilityIds: number[] = [];
  const createdOrderIds: number[] = [];
  let shopId: number | null = null;
  let serviceId: number | null = null;
  let technicianServiceId: number | null = null;
  let technicianShopAffiliationId: number | null = null;

  try {
    const category = await prisma.category.findFirst({
      where: { isActive: true, deletedAt: null },
      orderBy: { id: "asc" }
    });
    assert(category, "at least one active category must be seeded");

    const backofficeRepository = new BackofficeRepository(prisma);
    const bookingRepository = new BookingRepository(prisma);
    const shop = await backofficeRepository.createShop({
      ownerEmail: `schedule-owner-${marker}@needo.test`,
      ownerUsername: `Schedule Owner ${marker}`,
      ownerPasswordHash: passwordHash,
      name: `Schedule Flow Shop ${marker}`,
      city: "Tokyo",
      address: "Integration 2-2"
    });
    shopId = shop.id;
    assert(shop.ownerUserId, "shop owner user was not created");
    createdUserIds.push(shop.ownerUserId);
    await backofficeRepository.approveShop(shop.id, new Date());
    await prisma.$transaction((transaction) =>
      verifyShopServiceLocationInTransaction(transaction, {
        shopId: shop.id,
        verifiedById: shop.ownerUserId!,
        serviceLocation: { countryCode: "JP", admin1Code: "13", admin2Code: "13113" },
        auditAction: "qa.schedule_flow.service_location.verify",
        auditMetadata: { marker }
      })
    );

    const technicianAccount = await createFormalTestUser(prisma, {
      email: `schedule-technician-${marker}@needo.test`,
      passwordHash,
      username: `Schedule Technician ${marker}`
    });
    const customerAccounts = await Promise.all([0, 1].map((index) => createFormalTestUser(prisma, {
      email: `schedule-customer-${index}-${marker}@needo.test`,
      passwordHash,
      username: `Schedule Customer ${index} ${marker}`
    })));
    createdUserIds.push(technicianAccount.id, ...customerAccounts.map((account) => account.id));
    const technicianProfile = await prisma.technicianProfile.create({
      data: {
        userId: technicianAccount.id,
        displayName: `Schedule Technician ${marker}`,
        city: "Tokyo"
      }
    });
    const technicianIdentity = await prisma.userIdentity.create({
      data: {
        userId: technicianAccount.id,
        type: "technician",
        activeKey: `${technicianAccount.id}:technician`,
        scopeType: "technician_profile",
        scopeId: technicianProfile.id,
        displayName: technicianProfile.displayName,
        isActive: true
      }
    });
    const technicianNumberPart = String(technicianProfile.id).padStart(10, "0");
    await prisma.publicIdentifier.create({
      data: {
        publicId: `s${technicianNumberPart}`,
        numberPart: technicianNumberPart,
        kind: "S",
        userIdentityId: technicianIdentity.id,
        loginAllowed: true,
        searchable: true,
        status: "ACTIVE"
      }
    });
    await backofficeRepository.updateTechnician({
      scope: "platform",
      technicianId: technicianProfile.id,
      shopId: shop.id
    });
    await backofficeRepository.approveTechnician({
      scope: "platform",
      technicianId: technicianProfile.id,
      shopId: shop.id,
      approvedAt: new Date()
    });
    const technicianShopAffiliation = await prisma.technicianShopAffiliation.create({
      data: {
        technicianProfileId: technicianProfile.id,
        shopId: shop.id,
        relationshipType: "PARTNER",
        workStatus: "ACTIVE",
        activeKey: `technician:${technicianProfile.id}:shop:${shop.id}`,
        createdById: technicianAccount.id,
        updatedById: technicianAccount.id
      }
    });
    technicianShopAffiliationId = technicianShopAffiliation.id;

    const service = await backofficeRepository.createService({
      scope: "platform",
      shopId: shop.id,
      categoryId: category.id,
      name: `Schedule Service ${marker}`,
      city: "Tokyo",
      serviceMode: "store",
      priceAmount: 15000,
      durationMinutes: 60,
      status: "published"
    });
    serviceId = service.id;
    const technicianService = await prisma.technicianService.create({
      data: {
        shopId: shop.id,
        technicianId: technicianProfile.id,
        sourceShopServiceId: service.id,
        name: `Technician Schedule Service ${marker}`,
        categoryId: category.id,
        priceAmount: 16000,
        durationMinutes: 60,
        isActive: true,
        isBookable: true,
        createdBy: technicianAccount.id,
        updatedBy: technicianAccount.id
      }
    });
    technicianServiceId = technicianService.id;

    const startsAt = new Date("2026-09-15T01:00:00.000Z");
    const endsAt = new Date("2026-09-15T02:00:00.000Z");
    const primary = await bookingRepository.createScheduleSlot({
      scope: "merchant",
      shopId: shop.id,
      serviceId: service.id,
      technicianProfileId: technicianProfile.id,
      startsAt,
      endsAt,
      capacity: 1
    });
    assert(primary.outcome === "ok", "formal merchant slot was not created");
    createdSlotIds.push(primary.slot.id);
    const primaryDb = await prisma.scheduleSlot.findUnique({ where: { id: primary.slot.id } });
    assert(primaryDb?.availabilityId, "formal slot did not create matching availability");
    createdAvailabilityIds.push(primaryDb.availabilityId);
    assert(primaryDb.startsAt.getTime() === startsAt.getTime(), "offset timestamp was not stored as the exact UTC instant");

    const overlap = await bookingRepository.createScheduleSlot({
      scope: "merchant",
      shopId: shop.id,
      serviceId: service.id,
      technicianProfileId: technicianProfile.id,
      startsAt: new Date("2026-09-15T01:30:00.000Z"),
      endsAt: new Date("2026-09-15T02:30:00.000Z"),
      capacity: 1
    });
    assert(overlap.outcome === "conflict", "overlapping technician schedule was accepted");
    const crossShop = await bookingRepository.createScheduleSlot({
      scope: "merchant",
      shopId: shop.id + 1_000_000,
      serviceId: service.id,
      startsAt,
      endsAt,
      capacity: 1
    });
    assert(crossShop.outcome === "not_found", "schedule mutation crossed authenticated shop scope");

    const concurrent = await Promise.all(customerAccounts.map((customer) => bookingRepository.createBooking({
      customerUserId: customer.id,
      serviceId: service.id,
      scheduleSlotId: primary.slot.id,
      fulfillmentMode: "store",
      serviceLocation: { source: "SHOP_LOCATION" }
    })));
    const successfulConcurrentOrders = concurrent.filter(
      (result): result is Extract<NonNullable<typeof result>, { order: unknown }> =>
        result !== null && "order" in result
    );
    createdOrderIds.push(...successfulConcurrentOrders.map((result) => result.order.id));
    assert(successfulConcurrentOrders.length === 1, "capacity-one slot allowed more than one concurrent booking");
    const createdPendingOrder = successfulConcurrentOrders[0]!.order;
    assert(createdPendingOrder.status === "pending", "direct booking did not create a pending order");
    const [customerOrders, merchantOrders, technicianOrders] = await Promise.all([
      bookingRepository.listOrders({
        customerUserId: createdPendingOrder.customerUserId,
        page: 1,
        pageSize: 20
      }),
      bookingRepository.listOrders({ shopId: shop.id, page: 1, pageSize: 20 }),
      bookingRepository.listOrders({
        technicianProfileId: technicianProfile.id,
        page: 1,
        pageSize: 20
      })
    ]);
    assert(customerOrders.list.some((order) => order.id === createdPendingOrder.id), "customer order list missed the pending booking");
    assert(merchantOrders.list.some((order) => order.id === createdPendingOrder.id), "merchant order list missed the pending booking");
    assert(technicianOrders.list.some((order) => order.id === createdPendingOrder.id), "technician order list missed the pending booking");
    const bookedPrimary = await prisma.scheduleSlot.findUnique({ where: { id: primary.slot.id } });
    assert(bookedPrimary?.bookedCount === 1 && bookedPrimary.status === "BOOKED", "capacity-one slot state was not atomically booked");

    const pooled = await bookingRepository.createScheduleSlot({
      scope: "merchant",
      shopId: shop.id,
      serviceId: service.id,
      technicianProfileId: technicianProfile.id,
      startsAt: new Date("2026-09-15T03:00:00.000Z"),
      endsAt: new Date("2026-09-15T04:00:00.000Z"),
      capacity: 2
    });
    assert(pooled.outcome === "ok", "capacity-two unassigned slot was not created");
    createdSlotIds.push(pooled.slot.id);
    const pooledDb = await prisma.scheduleSlot.findUnique({ where: { id: pooled.slot.id } });
    assert(pooledDb?.availabilityId, "pooled slot did not create availability");
    createdAvailabilityIds.push(pooledDb.availabilityId);
    const pooledBookings = await Promise.all(customerAccounts.map((customer) => bookingRepository.createBooking({
      customerUserId: customer.id,
      serviceId: service.id,
      scheduleSlotId: pooled.slot.id,
      fulfillmentMode: "store",
      serviceLocation: { source: "SHOP_LOCATION" }
    })));
    const successfulPooledOrders = pooledBookings.filter(
      (result): result is Extract<NonNullable<typeof result>, { order: unknown }> =>
        result !== null && "order" in result
    );
    createdOrderIds.push(...successfulPooledOrders.map((result) => result.order.id));
    assert(successfulPooledOrders.length === 2, "capacity-two assigned slot did not accept two distinct customers");

    const technicianOwned = await bookingRepository.createScheduleSlot({
      scope: "technician",
      technicianProfileId: technicianProfile.id,
      technicianServiceId: technicianService.id,
      startsAt: new Date("2026-09-15T05:00:00.000Z"),
      endsAt: new Date("2026-09-15T06:00:00.000Z"),
      capacity: 1
    });
    assert(technicianOwned.outcome === "ok", "technician-owned service slot was not created");
    createdSlotIds.push(technicianOwned.slot.id);
    const technicianOwnedDb = await prisma.scheduleSlot.findUnique({ where: { id: technicianOwned.slot.id } });
    assert(technicianOwnedDb?.availabilityId, "technician-owned slot did not create availability");
    createdAvailabilityIds.push(technicianOwnedDb.availabilityId);
    const technicianList = await bookingRepository.listScheduleSlots({
      scope: "technician",
      technicianProfileId: technicianProfile.id,
      from: new Date("2026-09-15T00:00:00.000Z"),
      to: new Date("2026-09-16T00:00:00.000Z"),
      page: 1,
      pageSize: 20
    });
    assert(technicianList.list.some((slot) => slot.id === technicianOwned.slot.id), "technician schedule list missed its own formal slot");
    const blocked = await bookingRepository.updateScheduleSlot({
      scope: "technician",
      technicianProfileId: technicianProfile.id,
      id: technicianOwned.slot.id,
      status: "blocked"
    });
    assert(blocked.outcome === "ok" && blocked.slot.status === "blocked", "technician could not block its unused slot");
    const restored = await bookingRepository.updateScheduleSlot({
      scope: "technician",
      technicianProfileId: technicianProfile.id,
      id: technicianOwned.slot.id,
      status: "available"
    });
    assert(restored.outcome === "ok" && restored.slot.status === "available", "technician could not restore its slot");
    const deleted = await bookingRepository.deleteScheduleSlot({
      scope: "technician",
      technicianProfileId: technicianProfile.id,
      id: technicianOwned.slot.id
    });
    assert(deleted.outcome === "ok", "technician could not soft-delete its unused slot");

    console.log(JSON.stringify({
      database: databaseName,
      merchantSchedule: { created: true, overlapRejected: true, crossShopRejected: true },
      technicianSchedule: { created: true, listed: true, blocked: true, restored: true, softDeleted: true },
      timezone: { exactUtcInstantPreserved: true, sourceOffsetExample: "2026-09-15T10:00:00+09:00" },
      concurrency: { capacityOneAccepted: 1, capacityTwoAccepted: 2 },
      directBooking: {
        pendingCreated: true,
        slotReserved: true,
        customerVisible: true,
        merchantVisible: true,
        technicianVisible: true
      },
      status: "ok"
    }, null, 2));
  } finally {
    if (createdOrderIds.length > 0 || createdSlotIds.length > 0 || createdUserIds.length > 0 || shopId) {
      await prisma.$transaction(async (transaction) => {
        if (createdOrderIds.length > 0) {
          await transaction.bookingServiceLocation.deleteMany({
            where: { bookingOrderId: { in: createdOrderIds } }
          });
          await transaction.orderStatusHistory.deleteMany({ where: { bookingOrderId: { in: createdOrderIds } } });
          await transaction.bookingOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
        }
        if (createdSlotIds.length > 0) await transaction.scheduleSlot.deleteMany({ where: { id: { in: createdSlotIds } } });
        if (createdAvailabilityIds.length > 0) await transaction.availability.deleteMany({ where: { id: { in: createdAvailabilityIds } } });
        if (technicianServiceId) await transaction.technicianService.deleteMany({ where: { id: technicianServiceId } });
        if (serviceId) await transaction.service.deleteMany({ where: { id: serviceId } });
        await transaction.auditLog.deleteMany({
          where: {
            OR: [
              { actorId: { in: createdUserIds } },
              { targetType: "User", targetId: { in: createdUserIds } }
            ]
          }
        });
        await transaction.publicIdentifier.deleteMany({
          where: shopId ? { shopId } : { id: { in: [] } }
        });
        if (shopId) await transaction.shopServiceLocation.deleteMany({ where: { shopId } });
        if (technicianShopAffiliationId) {
          await transaction.technicianShopAffiliation.deleteMany({
            where: { id: technicianShopAffiliationId }
          });
        }
        await transaction.technicianProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
        if (shopId) await transaction.shop.deleteMany({ where: { id: shopId } });
        await deleteFormalTestUserFoundations(transaction, createdUserIds);
        await transaction.user.deleteMany({ where: { id: { in: createdUserIds } } });
      });
    }
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
