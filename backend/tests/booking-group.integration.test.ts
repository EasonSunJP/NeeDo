import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createExchangeBookingFixture } from "../scripts/check-exchange-booking-conversion-flow";
import { BookingRepository } from "../src/repositories/booking.repository";
import { BookingService } from "../src/services/booking.service";

const integration = process.env.RUN_BOOKING_GROUP_INTEGRATION === "true" ? describe : describe.skip;

integration("atomic technician group booking on an isolated local database", () => {
  let client: PrismaClient;
  let repository: BookingRepository;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || url.port !== "3308" || url.pathname !== "/needo_group_booking_test") {
      throw new Error("Group booking integration tests require the isolated local database");
    }
    const { PrismaClient: Client } = await import("@prisma/client");
    const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
    client = new Client({ adapter: new PrismaMariaDb({
      host: url.hostname, port: Number(url.port), database: url.pathname.slice(1),
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
      timezone: "Z", connectionLimit: 4
    }) });
    repository = new BookingRepository(client);
  });
  afterAll(async () => { await client?.$disconnect(); });

  async function fixture() {
    const marker = `booking-group-${randomUUID()}`;
    const base = await createExchangeBookingFixture(client, marker);
    const numberPart = String(Date.now() % 10_000_000_000).padStart(10, "0");
    await client.publicIdentifier.create({ data: {
      publicId: `shop${numberPart}`, numberPart, kind: "SHOP", status: "ACTIVE", shopId: base.shopId
    } });
    const admin1 = await client.administrativeRegion.findUniqueOrThrow({ where: { countryCode_officialCode: { countryCode: "JP", officialCode: "13" } } });
    const admin2 = await client.administrativeRegion.findUniqueOrThrow({ where: { countryCode_officialCode: { countryCode: "JP", officialCode: "13103" } } });
    await client.shopServiceLocation.create({ data: {
      shopId: base.shopId, countryCode: "JP", admin1RegionId: admin1.id,
      admin2RegionId: admin2.id, datasetVersion: admin1.sourceVersion, verifiedAt: new Date()
    } });
    await client.customerProfile.create({ data: { userId: base.ownerUserId, displayName: marker } });
    const black = await client.platformMembershipTierVersion.findFirstOrThrow({
      where: { tier: { code: "BLACK_DIAMOND" }, status: "PUBLISHED", deletedAt: null },
      orderBy: { version: "desc" }
    });
    await client.platformMembershipEntitlement.create({ data: {
      userId: base.ownerUserId, tierVersionId: black.id, source: "INTERNAL",
      sourceReference: marker, startsAt: new Date(Date.now() - 60_000)
    } });
    await client.exchangeMatchParticipant.updateMany({
      where: { id: { in: base.participantIds } }, data: { deletedAt: new Date() }
    });
    const input = {
      customerUserId: base.ownerUserId, shopId: base.shopId, startsAt: base.startsAt,
      guests: base.technicianProfileIds.map((technicianProfileId, index) => ({
        label: `Guest ${index + 1}`,
        assignments: [{
          technicianProfileId, serviceIds: [base.serviceId],
          scheduleSlotIds: [base.participantSlotIds[index]!], expectedPriceAmountJpy: 12_000
        }]
      })),
      paymentMethod: "onsite" as const, idempotencyKey: `${marker}:create`
    };
    return { base, input };
  }

  it("creates real orders for both guests, replays once, and cancels one without changing the other", async () => {
    const { base, input } = await fixture();
    const created = await repository.createGroupBooking(input);
    expect(created.guests.map((guest) => guest.orders.length)).toEqual([1, 1]);
    expect(created.guests[0]?.orders[0]?.bookingGroupPublicId).toBe(created.publicId);
    expect(created.totalPriceAmountJpy).toBe(24_000);
    const orderIds = created.guests.flatMap((guest) => guest.orders.map((order) => order.id));
    expect(await client.bookingOrderServiceItem.count({ where: { bookingOrderId: { in: orderIds } } })).toBe(2);
    expect((await repository.createGroupBooking(input)).id).toBe(created.id);
    expect(await client.bookingOrder.count({ where: { bookingGroupGuest: { bookingGroupId: created.id } } })).toBe(2);
    await client.bookingOrder.update({ where: { id: orderIds[0]! }, data: {
      paymentStatus: "CONFIRMED", paymentConfirmedAt: new Date(), paymentConfirmedById: base.ownerUserId
    } });
    const service = new BookingService(repository);
    await service.transitionOrder({ userId: base.ownerUserId, roles: ["customer"], currentIdentityType: "customer" }, orderIds[0]!, "cancel", "one guest cancelled");
    const first = await client.bookingOrder.findUniqueOrThrow({ where: { id: orderIds[0]! } });
    const second = await client.bookingOrder.findUniqueOrThrow({ where: { id: orderIds[1]! } });
    expect([first.status, second.status]).toEqual(["CANCELLED", "PENDING"]);
    expect([first.paymentStatus, second.paymentStatus]).toEqual(["REFUND_PENDING", "PENDING"]);
    expect((await client.scheduleSlot.findUniqueOrThrow({ where: { id: base.participantSlotIds[0]! } })).bookedCount).toBe(0);
    expect((await client.scheduleSlot.findUniqueOrThrow({ where: { id: base.participantSlotIds[1]! } })).bookedCount).toBe(1);
    expect((await repository.findGroupBooking(created.publicId))?.totalPriceAmountJpy).toBe(12_000);
  });

  it("revises one unpaid assignment atomically, recalculates its price, and leaves its sibling untouched", async () => {
    const { base, input } = await fixture();
    const created = await repository.createGroupBooking(input);
    const original = created.guests[0]!.orders[0]!;
    const sibling = created.guests[1]!.orders[0]!;
    const service = await client.service.findUniqueOrThrow({ where: { id: base.serviceId } });
    const replacementService = await client.service.create({ data: {
      categoryId: service.categoryId, shopId: base.shopId, name: `${input.idempotencyKey} revised`,
      city: "Tokyo", priceAmount: 15_000, durationMinutes: 60, status: "published"
    } });
    const replacementSlot = await client.scheduleSlot.create({ data: {
      shopId: base.shopId, serviceId: replacementService.id,
      technicianProfileId: base.technicianProfileIds[0]!, startsAt: base.startsAt,
      endsAt: new Date(base.startsAt.getTime() + 60 * 60_000), capacity: 1,
      bookedCount: 0, status: "AVAILABLE"
    } });
    const request = {
      customerUserId: base.ownerUserId, groupPublicId: created.publicId, orderId: original.id,
      expectedUpdatedAt: original.updatedAt, idempotencyKey: `${input.idempotencyKey}:revise`,
      assignment: { technicianProfileId: base.technicianProfileIds[0]!, serviceIds: [replacementService.id],
        scheduleSlotIds: [replacementSlot.id], expectedPriceAmountJpy: 15_000 }
    };
    const revision = (repository as unknown as { reviseGroupOrder: (value: typeof request) => Promise<{ group: typeof created; replay: boolean }> }).reviseGroupOrder;
    const result = await revision.call(repository, request);
    expect(result.replay).toBe(false);
    expect(result.group.totalPriceAmountJpy).toBe(27_000);
    expect(result.group.guests[1]!.orders[0]!.id).toBe(sibling.id);
    expect((await client.bookingOrder.findUniqueOrThrow({ where: { id: original.id } })).serviceId).toBe(replacementService.id);
    expect((await client.scheduleSlot.findUniqueOrThrow({ where: { id: base.participantSlotIds[0]! } })).bookedCount).toBe(0);
    expect((await client.scheduleSlot.findUniqueOrThrow({ where: { id: replacementSlot.id } })).bookedCount).toBe(1);
    expect((await revision.call(repository, request)).replay).toBe(true);
    await expect(revision.call(repository, { ...request, idempotencyKey: `${request.idempotencyKey}:stale` })).rejects.toThrow("revision_conflict");
    await expect(revision.call(repository, { ...request, assignment: { ...request.assignment, expectedPriceAmountJpy: 14_000 } })).rejects.toThrow("idempotency_conflict");
  });

  it("rejects paid assignment revisions and sibling technician conflicts without moving reservations", async () => {
    const { base, input } = await fixture();
    const created = await repository.createGroupBooking(input);
    const first = created.guests[0]!.orders[0]!;
    const revision = {
      customerUserId: base.ownerUserId, groupPublicId: created.publicId, orderId: first.id,
      expectedUpdatedAt: first.updatedAt, idempotencyKey: `${input.idempotencyKey}:paid`,
      assignment: { technicianProfileId: base.technicianProfileIds[1]!, serviceIds: [base.serviceId],
        scheduleSlotIds: [base.participantSlotIds[1]!], expectedPriceAmountJpy: 12_000 }
    };
    await expect(repository.reviseGroupOrder(revision)).rejects.toThrow("slot_unavailable");
    await client.bookingOrder.update({ where: { id: first.id }, data: {
      paymentStatus: "CONFIRMED", paymentConfirmedAt: new Date(), paymentConfirmedById: base.ownerUserId
    } });
    await expect(repository.reviseGroupOrder({ ...revision, idempotencyKey: `${revision.idempotencyKey}:2` }))
      .rejects.toThrow("revision_conflict");
    const paid = await client.bookingOrder.findUniqueOrThrow({ where: { id: first.id } });
    await expect(repository.reviseGroupOrder({ ...revision, expectedUpdatedAt: paid.updatedAt,
      idempotencyKey: `${revision.idempotencyKey}:3` })).rejects.toThrow("revision_financial_unavailable");
    expect((await client.scheduleSlot.findUniqueOrThrow({ where: { id: base.participantSlotIds[0]! } })).bookedCount).toBe(1);
    expect((await client.scheduleSlot.findUniqueOrThrow({ where: { id: base.participantSlotIds[1]! } })).bookedCount).toBe(1);
  });

  it("removes every unpaid assignment of one guest in one mutation and keeps other guests", async () => {
    const { base, input } = await fixture();
    const created = await repository.createGroupBooking(input);
    const first = created.guests[0]!.orders[0]!;
    const remove = (repository as unknown as { removeGroupGuest: (value: {
      customerUserId: number; groupPublicId: string; guestId: number;
      expectedOrders: Array<{ id: number; updatedAt: Date }>; idempotencyKey: string
    }) => Promise<{ group: typeof created; replay: boolean }> }).removeGroupGuest;
    const request = { customerUserId: base.ownerUserId, groupPublicId: created.publicId,
      guestId: created.guests[0]!.id, expectedOrders: [{ id: first.id, updatedAt: first.updatedAt }],
      idempotencyKey: `${input.idempotencyKey}:remove` };
    const result = await remove.call(repository, request);
    expect(result.group.totalPriceAmountJpy).toBe(12_000);
    expect(result.group.guests[0]!.orders[0]!.status).toBe("cancelled");
    expect(result.group.guests[1]!.orders[0]!.status).toBe("pending");
    expect((await client.scheduleSlot.findUniqueOrThrow({ where: { id: base.participantSlotIds[0]! } })).bookedCount).toBe(0);
    expect((await remove.call(repository, request)).replay).toBe(true);
  });

  it("rolls back a revision after new slot reservation when the final mutation write fails", async () => {
    const { base, input } = await fixture();
    const created = await repository.createGroupBooking(input);
    const original = created.guests[0]!.orders[0]!;
    const replacementSlot = await client.scheduleSlot.create({ data: {
      shopId: base.shopId, serviceId: base.serviceId,
      technicianProfileId: base.technicianProfileIds[0]!, startsAt: base.startsAt,
      endsAt: new Date(base.startsAt.getTime() + 60 * 60_000), capacity: 1,
      bookedCount: 0, status: "AVAILABLE"
    } });
    const mysql = await import("mysql2/promise");
    const connection = await mysql.createConnection({ host: "127.0.0.1", port: 3308, user: "root", database: "needo_group_booking_test" });
    await connection.query("CREATE TRIGGER booking_group_revision_abort BEFORE INSERT ON booking_group_mutations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced revision failure'");
    try {
      await expect(repository.reviseGroupOrder({
        customerUserId: base.ownerUserId, groupPublicId: created.publicId, orderId: original.id,
        expectedUpdatedAt: original.updatedAt, idempotencyKey: `${input.idempotencyKey}:rollback`,
        assignment: { technicianProfileId: base.technicianProfileIds[0]!, serviceIds: [base.serviceId],
          scheduleSlotIds: [replacementSlot.id], expectedPriceAmountJpy: 12_000 }
      })).rejects.toThrow();
    } finally {
      await connection.query("DROP TRIGGER booking_group_revision_abort");
      await connection.end();
    }
    expect((await client.bookingOrder.findUniqueOrThrow({ where: { id: original.id } })).scheduleSlotId).toBe(base.participantSlotIds[0]);
    expect((await client.scheduleSlot.findUniqueOrThrow({ where: { id: base.participantSlotIds[0]! } })).bookedCount).toBe(1);
    expect((await client.scheduleSlot.findUniqueOrThrow({ where: { id: replacementSlot.id } })).bookedCount).toBe(0);
  });

  it("serializes competing revisions and rejects a stale expected price", async () => {
    const { base, input } = await fixture();
    const created = await repository.createGroupBooking(input);
    const original = created.guests[0]!.orders[0]!;
    const candidates = await Promise.all([0, 1].map(() => client.scheduleSlot.create({ data: {
      shopId: base.shopId, serviceId: base.serviceId,
      technicianProfileId: base.technicianProfileIds[0]!, startsAt: base.startsAt,
      endsAt: new Date(base.startsAt.getTime() + 60 * 60_000), capacity: 1,
      bookedCount: 0, status: "AVAILABLE"
    } })));
    const request = { customerUserId: base.ownerUserId, groupPublicId: created.publicId,
      orderId: original.id, expectedUpdatedAt: original.updatedAt,
      assignment: { technicianProfileId: base.technicianProfileIds[0]!, serviceIds: [base.serviceId],
        scheduleSlotIds: [candidates[0]!.id], expectedPriceAmountJpy: 11_999 },
      idempotencyKey: `${input.idempotencyKey}:wrong-price` };
    await expect(repository.reviseGroupOrder(request)).rejects.toThrow("price_changed");
    const outcomes = await Promise.allSettled(candidates.map((candidate, index) =>
      repository.reviseGroupOrder({ ...request,
        assignment: { ...request.assignment, scheduleSlotIds: [candidate.id], expectedPriceAmountJpy: 12_000 },
        idempotencyKey: `${input.idempotencyKey}:race:${index}` })));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect((outcomes.find((outcome) => outcome.status === "rejected") as PromiseRejectedResult).reason.message).toBe("revision_conflict");
    expect((await client.scheduleSlot.findMany({ where: { id: { in: candidates.map((candidate) => candidate.id) } } }))
      .reduce((sum, slot) => sum + slot.bookedCount, 0)).toBe(1);
  });

  it("removes both technician assignments of a single guest atomically", async () => {
    const { base, input } = await fixture();
    const created = await repository.createGroupBooking({ ...input,
      guests: [{ label: "One guest", assignments: input.guests.flatMap((guest) => guest.assignments) }] });
    const orders = created.guests[0]!.orders;
    expect(orders).toHaveLength(2);
    const result = await repository.removeGroupGuest({ customerUserId: base.ownerUserId,
      groupPublicId: created.publicId, guestId: created.guests[0]!.id,
      expectedOrders: orders.map((order) => ({ id: order.id, updatedAt: order.updatedAt })),
      idempotencyKey: `${input.idempotencyKey}:remove-all` });
    expect(result.group.totalPriceAmountJpy).toBe(0);
    expect(result.group.guests[0]!.orders.map((order) => order.status)).toEqual(["cancelled", "cancelled"]);
    for (const id of base.participantSlotIds) {
      expect((await client.scheduleSlot.findUniqueOrThrow({ where: { id } })).bookedCount).toBe(0);
    }
  });

  it("rolls back every reservation and group row when a late database write fails", async () => {
    const { base, input } = await fixture();
    const mysql = await import("mysql2/promise");
    const connection = await mysql.createConnection({ host: "127.0.0.1", port: 3308, user: "root", database: "needo_group_booking_test" });
    await connection.query("CREATE TRIGGER booking_group_test_abort BEFORE INSERT ON booking_group_guests FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced late failure'");
    try {
      await expect(repository.createGroupBooking(input)).rejects.toThrow();
    } finally {
      await connection.query("DROP TRIGGER booking_group_test_abort");
      await connection.end();
    }
    expect(await client.bookingGroup.count({ where: { customerUserId: base.ownerUserId } })).toBe(0);
    expect(await client.bookingOrder.count({ where: { bookingGroupGuest: { group: { customerUserId: base.ownerUserId } } } })).toBe(0);
    for (const id of base.participantSlotIds) {
      expect((await client.scheduleSlot.findUniqueOrThrow({ where: { id } })).bookedCount).toBe(0);
    }
  });

  it("does not replace a free member's existing pending order when another group overlaps", async () => {
    const first = await fixture();
    await client.platformMembershipEntitlement.updateMany({
      where: { userId: first.base.ownerUserId }, data: { deletedAt: new Date() }
    });
    const firstInput = { ...first.input, guests: first.input.guests.slice(0, 1) };
    const created = await repository.createGroupBooking(firstInput);
    const second = await fixture();
    const secondInput = {
      ...second.input,
      customerUserId: first.base.ownerUserId,
      startsAt: first.base.startsAt,
      guests: [{ ...second.input.guests[0]!, assignments: [{
        ...second.input.guests[0]!.assignments[0]!, scheduleSlotIds: [second.base.participantSlotIds[0]!]
      }] }]
    };
    await client.scheduleSlot.update({ where: { id: second.base.participantSlotIds[0]! }, data: {
      startsAt: first.base.startsAt,
      endsAt: new Date(first.base.startsAt.getTime() + 60 * 60_000),
      occupiedStartsAt: first.base.startsAt,
      occupiedEndsAt: new Date(first.base.startsAt.getTime() + 60 * 60_000)
    } });
    await expect(repository.createGroupBooking(secondInput)).rejects.toThrow("slot_unavailable");
    expect((await client.bookingOrder.findUniqueOrThrow({ where: { id: created.guests[0]!.orders[0]!.id } })).status).toBe("PENDING");
    expect((await client.scheduleSlot.findUniqueOrThrow({ where: { id: second.base.participantSlotIds[0]! } })).bookedCount).toBe(0);
  });

  it.each(["PENDING", "CONFIRMED"] as const)("rejects a technician overlap with the full span of an existing %s order", async (status) => {
    const first = await fixture();
    const created = await repository.createGroupBooking({ ...first.input, guests: first.input.guests.slice(0, 1) });
    const orderId = created.guests[0]!.orders[0]!.id;
    const laterStart = new Date(first.base.startsAt.getTime() + 60 * 60_000);
    await client.bookingOrder.update({ where: { id: orderId }, data: {
      status, endsAt: new Date(laterStart.getTime() + 60 * 60_000)
    } });
    const laterSlot = await client.scheduleSlot.create({ data: {
      shopId: first.base.shopId, serviceId: first.base.serviceId,
      technicianProfileId: first.base.technicianProfileIds[0]!, startsAt: laterStart,
      endsAt: new Date(laterStart.getTime() + 60 * 60_000), capacity: 1,
      bookedCount: 0, status: "AVAILABLE"
    } });
    const second = await fixture();
    const request = {
      ...first.input, customerUserId: second.base.ownerUserId,
      startsAt: laterStart, idempotencyKey: `later-${randomUUID()}`,
      guests: [{ label: "Later", assignments: [{
        technicianProfileId: first.base.technicianProfileIds[0]!, serviceIds: [first.base.serviceId],
        scheduleSlotIds: [laterSlot.id], expectedPriceAmountJpy: 12_000
      }] }]
    };
    await expect(repository.createGroupBooking(request)).rejects.toThrow("slot_unavailable");
    expect((await client.scheduleSlot.findUniqueOrThrow({ where: { id: laterSlot.id } })).bookedCount).toBe(0);
  });

  it("allows only one of two concurrent purchasers to reserve the same group slots", async () => {
    const first = await fixture();
    const second = await fixture();
    const rival = { ...first.input, customerUserId: second.base.ownerUserId, idempotencyKey: `rival-${randomUUID()}` };
    const outcomes = await Promise.allSettled([
      repository.createGroupBooking(first.input), repository.createGroupBooking(rival)
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    for (const id of first.base.participantSlotIds) {
      expect((await client.scheduleSlot.findUniqueOrThrow({ where: { id } })).bookedCount).toBe(1);
    }
    expect(await client.bookingOrder.count({ where: { shopId: first.base.shopId, bookingGroupGuestId: { not: null } } })).toBe(2);
  });
});
