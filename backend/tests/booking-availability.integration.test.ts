import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createExchangeBookingFixture } from "../scripts/check-exchange-booking-conversion-flow";
import { requireSafeExchangeClaimFlowEnvironment } from "../scripts/support/exchange-claim-flow-safety";
import {
  BookingRepository,
  type AvailabilityListPayload,
  type ScheduleSlotPayload
} from "../src/repositories/booking.repository";
import { BookingService } from "../src/services/booking.service";
import type { PaginatedResponse } from "../src/utils/pagination";

function requireSlotList(
  result: PaginatedResponse<AvailabilityListPayload>
): PaginatedResponse<ScheduleSlotPayload> {
  const list: ScheduleSlotPayload[] = result.list.map((item) => {
    if (!("id" in item)) throw new Error("Expected schedule slots, not availability summaries");
    return item;
  });
  return { ...result, list };
}

const enabled = process.env.RUN_BOOKING_AVAILABILITY_INTEGRATION === "true";
const integration = enabled ? describe : describe.skip;

integration("public availability agrees with authoritative Booking", () => {
  let client: PrismaClient;
  beforeAll(async () => {
    requireSafeExchangeClaimFlowEnvironment(process.env.ENV_FILE);
    // Environment is checked before constructing a connection; no remote targets are accepted.
    const { PrismaClient: Client } = await import("@prisma/client");
    const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
    const url = new URL(process.env.DATABASE_URL!);
    client = new Client({
      transactionOptions: { isolationLevel: "ReadCommitted" },
      adapter: new PrismaMariaDb({
        host: url.hostname,
        port: Number(url.port),
        database: url.pathname.slice(1),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        allowPublicKeyRetrieval: true,
        timezone: "Z",
        connectionLimit: 2
      })
    });
  });
  afterAll(async () => {
    await client?.$disconnect();
  });

  async function withFixture(run: (context: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
    const rollback = new Error("rollback availability fixture");
    const marker = `availability-${randomUUID()}`;
    try {
      await client.$transaction(
        async (tx) => {
          await run(await fixture(tx, marker));
          throw rollback;
        },
        { timeout: 30_000 }
      );
    } catch (error) {
      if (error !== rollback) throw error;
    }
    expect(await client.user.count({ where: { email: { startsWith: marker } } })).toBe(0);
  }

  async function fixture(tx: Prisma.TransactionClient, marker: string) {
    const base = await createExchangeBookingFixture(tx, marker);
    const publicNumber = String(Date.now() % 10_000_000_000).padStart(10, "0");
    await tx.publicIdentifier.create({
      data: {
        publicId: `shop${publicNumber}`,
        numberPart: publicNumber,
        kind: "SHOP",
        status: "ACTIVE",
        shopId: base.shopId
      }
    });
    const location = await tx.shopServiceLocation.findFirstOrThrow({
      where: { deletedAt: null, countryCode: "JP", datasetVersion: "N03-20260101" }
    });
    await tx.shopServiceLocation.create({
      data: {
        shopId: base.shopId,
        countryCode: location.countryCode,
        admin1RegionId: location.admin1RegionId,
        admin2RegionId: location.admin2RegionId,
        datasetVersion: location.datasetVersion,
        verifiedAt: new Date()
      }
    });
    await tx.shop.update({ where: { id: base.shopId }, data: { pricingMode: "TECHNICIAN" } });
    const service = await tx.technicianService.create({
      data: {
        technicianId: base.technicianProfileIds[0]!,
        shopId: base.shopId,
        categoryId: base.categoryId,
        name: marker,
        priceAmount: 8800,
        durationMinutes: 60
      }
    });
    const slotId = base.participantSlotIds[0]!;
    const nextSlotId = base.participantSlotIds[1]!;
    await tx.scheduleSlot.updateMany({
      where: { id: { in: base.participantSlotIds } },
      data: {
        serviceId: null,
        technicianServiceId: service.id,
        technicianProfileId: base.technicianProfileIds[0]!
      }
    });
    await tx.scheduleSlot.update({
      where: { id: nextSlotId },
      data: {
        startsAt: new Date(base.startsAt.getTime() + 86_400_000),
        endsAt: new Date(base.endsAt.getTime() + 86_400_000)
      }
    });
    await tx.exchangeMatchParticipant.updateMany({
      where: { id: { in: base.participantIds } },
      data: { deletedAt: new Date() }
    });
    await tx.bookingOrder.update({ where: { id: base.oldOrderId }, data: { status: "CANCELLED" } });
    // Keep all repository writes inside the enclosing transaction, which always rolls back.
    const repository = new BookingRepository(
      new Proxy(tx, {
        get(target, key) {
          if (key === "$transaction")
            return (operation: (transaction: Prisma.TransactionClient) => unknown) => operation(tx);
          return Reflect.get(target, key);
        }
      }) as PrismaClient
    );
    const booking = new BookingService(repository);
    const actor = {
      userId: base.ownerUserId,
      currentIdentityType: "customer",
      roles: ["customer"]
    };
    const viewer = { userId: base.ownerUserId, identityType: "customer" };
    const query = {
      technicianServiceId: service.id,
      shopId: base.shopId,
      from: new Date(base.startsAt.getTime() - 86_400_000),
      to: new Date(base.endsAt.getTime() + 86_400_000),
      page: 1,
      pageSize: 100
    };
    const create = (id = slotId) =>
      booking.createBooking(actor, {
        scheduleSlotId: id,
        technicianServiceId: service.id,
        expectedPriceAmountJpy: 8800,
        fulfillmentMode: "store"
      });
    const list = async (includeUnavailable = false) =>
      requireSlotList(await booking.listAvailableSlots({ ...query, includeUnavailable }, viewer));
    const conflict = (data: Prisma.BookingOrderUpdateInput) =>
      tx.bookingOrder.update({
        where: { id: base.oldOrderId },
        data: {
          startsAt: base.startsAt,
          endsAt: base.endsAt,
          status: "CONFIRMED",
          ...data
        }
      });
    return {
      tx,
      base,
      booking,
      repository,
      viewer,
      query,
      slotId,
      nextSlotId,
      create,
      list,
      conflict
    };
  }

  it("hides a zero-count slot blocked by a technician order on a different slot", async () => {
    await withFixture(async (f) => {
      await f.conflict({ customer: { connect: { id: f.base.providerUserIds[1]! } } });
      await expect(f.create()).rejects.toMatchObject({
        statusCode: 409,
        message: "error.booking.slot_unavailable"
      });
      expect((await f.list()).list.map((slot) => slot.id)).toEqual([f.nextSlotId]);
      expect((await f.list(true)).list.find((slot) => slot.id === f.slotId)?.status).toBe(
        "blocked"
      );
      await expect(f.create(f.nextSlotId)).resolves.toMatchObject({ status: "pending" });
    });
  });

  it("applies the authenticated customer's conflict without hiding inventory from other viewers", async () => {
    await withFixture(async (f) => {
      await f.conflict({ technicianProfile: { connect: { id: f.base.technicianProfileIds[1]! } } });
      await expect(f.create()).rejects.toMatchObject({ message: "error.booking.slot_unavailable" });
      expect((await f.list()).list.map((slot) => slot.id)).toEqual([f.nextSlotId]);
      expect((await f.booking.listAvailableSlots(f.query)).total).toBe(2);
    });
  });

  it("hides Exchange reservations and immediately releases their projection when released", async () => {
    await withFixture(async (f) => {
      const participantId = f.base.participantIds[0]!;
      await f.tx.exchangeMatchParticipant.update({
        where: { id: participantId },
        data: { activeReservationKey: randomUUID(), deletedAt: null }
      });
      await expect(f.create()).rejects.toMatchObject({ message: "error.booking.slot_unavailable" });
      expect((await f.list()).total).toBe(1);
      await f.tx.exchangeMatchParticipant.update({
        where: { id: participantId },
        data: { deletedAt: new Date() }
      });
      expect((await f.list()).total).toBe(2);
      await expect(f.create()).resolves.toMatchObject({ status: "pending" });
    });
  });

  it("does not advertise an already-started slot", async () => {
    await withFixture(async (f) => {
      await f.tx.scheduleSlot.update({
        where: { id: f.slotId },
        data: { startsAt: new Date(Date.now() - 60_000) }
      });
      await expect(f.create()).rejects.toMatchObject({ message: "error.booking.slot_unavailable" });
      expect((await f.list()).total).toBe(1);
      expect((await f.list(true)).list.find((slot) => slot.id === f.slotId)?.status).toBe(
        "blocked"
      );
    });
  });

  it("keeps a normal customer's replaceable pending slot bookable", async () => {
    await withFixture(async (f) => {
      await f.create();
      expect((await f.list()).list.find((slot) => slot.id === f.slotId)).toMatchObject({
        status: "available",
        bookedCount: 0
      });
      await expect(f.create()).resolves.toMatchObject({ status: "pending" });
      expect(await f.tx.scheduleSlot.findUnique({ where: { id: f.slotId } })).toMatchObject({
        bookedCount: 1
      });
    });
  });

  it("fails closed when a pending order cannot release its stale capacity counter", async () => {
    await withFixture(async (f) => {
      await f.create();
      await f.tx.scheduleSlot.update({
        where: { id: f.slotId },
        data: { bookedCount: 0, status: "AVAILABLE" }
      });
      // Booking replaces all of this customer's ordinary pending orders, even on another slot.
      expect((await f.list()).total).toBe(0);
      expect((await f.list(true)).list.find((slot) => slot.id === f.slotId)?.status).toBe(
        "blocked"
      );
      await expect(f.create(f.nextSlotId)).rejects.toMatchObject({
        message: "error.booking.slot_unavailable"
      });
    });
  });

  it.each(["CANCELLED", "COMPLETED", "PENDING"] as const)(
    "does not turn a different-slot %s order into a technician hard lock",
    async (status) => {
      await withFixture(async (f) => {
        await f.conflict({ status, customer: { connect: { id: f.base.providerUserIds[1]! } } });
        expect((await f.list()).total).toBe(2);
        await expect(f.create()).resolves.toMatchObject({ status: "pending" });
      });
    }
  );

  it("refreshes cancelled/deleted conflicts and uses strict overlap boundaries", async () => {
    await withFixture(async (f) => {
      await f.conflict({});
      expect((await f.list()).total).toBe(1);
      await f.conflict({ status: "CANCELLED" });
      expect((await f.list()).total).toBe(2);
      await f.conflict({ deletedAt: new Date() });
      expect((await f.list()).total).toBe(2);
      await f.conflict({
        deletedAt: null,
        startsAt: new Date(f.base.startsAt.getTime() - 3_600_000),
        endsAt: f.base.startsAt
      });
      expect((await f.list()).total).toBe(2);
      await expect(f.create()).resolves.toMatchObject({ status: "pending" });
    });
  });

  it("filters conflicts before pagination and returns the matching total", async () => {
    await withFixture(async (f) => {
      await f.conflict({});
      const result = await f.booking.listAvailableSlots({ ...f.query, pageSize: 1 }, f.viewer);
      expect(result).toMatchObject({ total: 1, page_size: 1, list: [{ id: f.nextSlotId }] });
    });
  });

  it("keeps black-member pending conflicts and full capacity unavailable", async () => {
    await withFixture(async (f) => {
      await f.tx.customerProfile.create({
        data: { userId: f.base.ownerUserId, displayName: "Test customer", membershipLevel: "black" }
      });
      await f.conflict({
        status: "PENDING",
        technicianProfile: { connect: { id: f.base.technicianProfileIds[1]! } }
      });
      await expect(f.create()).rejects.toMatchObject({ message: "error.booking.slot_unavailable" });
      expect((await f.list()).total).toBe(1);
      await f.conflict({ status: "CANCELLED" });
      await f.create();
      expect((await f.list()).total).toBe(1);
      expect((await f.list(true)).list.find((slot) => slot.id === f.slotId)?.status).not.toBe(
        "available"
      );
    });
  });

  it("honors capacity greater than one without making a same-slot technician order a global lock", async () => {
    await withFixture(async (f) => {
      await f.tx.scheduleSlot.update({
        where: { id: f.slotId },
        data: { capacity: 2, bookedCount: 1 }
      });
      await f.conflict({
        scheduleSlot: { connect: { id: f.slotId } },
        customer: { connect: { id: f.base.providerUserIds[1]! } }
      });
      expect((await f.list()).total).toBe(2);
      await f.create();
      expect(await f.tx.scheduleSlot.findUnique({ where: { id: f.slotId } })).toMatchObject({
        bookedCount: 2,
        status: "BOOKED"
      });
      expect((await f.booking.listAvailableSlots(f.query)).total).toBe(1);
    });
  });

  it("does not publish technician-service slots after the shop affiliation ends", async () => {
    await withFixture(async (f) => {
      await f.tx.technicianShopAffiliation.update({
        where: { id: f.base.affiliationIds[0]! },
        data: { endsAt: new Date(Date.now() - 1000) }
      });
      await expect(f.create()).rejects.toMatchObject({ message: "error.booking.slot_unavailable" });
      expect((await f.list()).total).toBe(0);
    });
  });

  it("does not publish old technician-service slots after the shop changes pricing mode", async () => {
    await withFixture(async (f) => {
      await f.tx.shop.update({ where: { id: f.base.shopId }, data: { pricingMode: "MERCHANT" } });
      await expect(f.create()).rejects.toMatchObject({ message: "error.booking.slot_unavailable" });
      expect((await f.list()).total).toBe(0);
    });
  });

  it.each(["technician", "shop-service"])(
    "applies the same conflict rules to %s queries",
    async (mode) => {
      await withFixture(async (f) => {
        await f.conflict({});
        const { technicianServiceId: _serviceId, ...range } = f.query;
        void _serviceId;
        if (mode === "shop-service") {
          await f.tx.shop.update({
            where: { id: f.base.shopId },
            data: { pricingMode: "MERCHANT" }
          });
          await f.tx.scheduleSlot.updateMany({
            where: { id: { in: f.base.participantSlotIds } },
            data: { serviceId: f.base.serviceId, technicianServiceId: null }
          });
        }
        const result = requireSlotList(await f.booking.listAvailableSlots(
          {
            ...range,
            ...(mode === "technician"
              ? { technicianId: f.base.technicianProfileIds[0]! }
              : { serviceId: f.base.serviceId })
          },
          f.viewer
        ));
        expect(result.list.map((slot) => slot.id)).toEqual([f.nextSlotId]);
      });
    }
  );

  it("keeps the page and count in one real snapshot while another connection consumes capacity", async () => {
    const marker = `availability-snapshot-${randomUUID()}`;
    const data = await client.$transaction(async (tx) => {
      const category = await tx.category.findFirstOrThrow({
        where: { deletedAt: null, isActive: true }
      });
      const location = await tx.shopServiceLocation.findFirstOrThrow({
        where: { deletedAt: null, countryCode: "JP", datasetVersion: "N03-20260101" }
      });
      const shop = await tx.shop.create({
        data: { name: marker, city: "Tokyo", address: "Tokyo", status: "published" }
      });
      const numberPart = String(Date.now() % 10_000_000_000).padStart(10, "0");
      await tx.publicIdentifier.create({
        data: {
          kind: "SHOP",
          publicId: `shop${numberPart}`,
          numberPart,
          shopId: shop.id,
          status: "ACTIVE"
        }
      });
      await tx.shopServiceLocation.create({
        data: {
          shopId: shop.id,
          countryCode: "JP",
          admin1RegionId: location.admin1RegionId,
          admin2RegionId: location.admin2RegionId,
          datasetVersion: location.datasetVersion,
          verifiedAt: new Date()
        }
      });
      const service = await tx.service.create({
        data: {
          shopId: shop.id,
          categoryId: category.id,
          name: marker,
          city: "Tokyo",
          status: "published",
          priceAmount: 8800,
          durationMinutes: 60
        }
      });
      const startsAt = new Date(Date.now() + 3_600_000);
      const endsAt = new Date(startsAt.getTime() + 3_600_000);
      const slot = await tx.scheduleSlot.create({
        data: { shopId: shop.id, serviceId: service.id, startsAt, endsAt }
      });
      return { shop, service, slot };
    });
    try {
      let readConnection: unknown;
      let writeConnection: unknown;
      const repository = new BookingRepository(
        new Proxy(client, {
          get(target, key) {
            if (key !== "$transaction") return Reflect.get(target, key);
            return (
              operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
              options: { isolationLevel: Prisma.TransactionIsolationLevel }
            ) =>
              client.$transaction(async (tx) => {
                expect(options.isolationLevel).toBe("RepeatableRead");
                readConnection = await tx.$queryRaw`SELECT CONNECTION_ID() AS id`;
                return operation(
                  new Proxy(tx, {
                    get(transaction, property) {
                      if (property !== "shopServiceLocation")
                        return Reflect.get(transaction, property);
                      return {
                        findMany: async (args: Prisma.ShopServiceLocationFindManyArgs) => {
                          const locations = await transaction.shopServiceLocation.findMany(args);
                          await client.$transaction(async (writer) => {
                            writeConnection = await writer.$queryRaw`SELECT CONNECTION_ID() AS id`;
                            await writer.scheduleSlot.update({
                              where: { id: data.slot.id },
                              data: { bookedCount: 1, status: "BOOKED" }
                            });
                          });
                          return locations;
                        }
                      };
                    }
                  })
                );
              }, options);
          }
        })
      );
      const query = {
        serviceId: data.service.id,
        from: data.slot.startsAt,
        to: data.slot.endsAt,
        page: 1,
        pageSize: 1
      };
      expect(await repository.listAvailableSlots(query)).toMatchObject({
        total: 1,
        list: [{ id: data.slot.id, bookedCount: 0 }]
      });
      expect(readConnection).not.toEqual(writeConnection);
      expect(await new BookingRepository(client).listAvailableSlots(query)).toMatchObject({
        total: 0,
        list: []
      });
    } finally {
      await client.$transaction(async (tx) => {
        await tx.scheduleSlot.delete({ where: { id: data.slot.id } });
        await tx.service.delete({ where: { id: data.service.id } });
        await tx.shopServiceLocation.delete({ where: { shopId: data.shop.id } });
        await tx.publicIdentifier.deleteMany({ where: { shopId: data.shop.id } });
        await tx.shop.delete({ where: { id: data.shop.id } });
      });
      expect(await client.shop.count({ where: { name: marker } })).toBe(0);
      expect(await client.scheduleSlot.count({ where: { shopId: data.shop.id } })).toBe(0);
    }
  });
});
