import {
  ScheduleSlotInventoryRepairRepository
} from "../src/repositories/schedule-slot-inventory-repair.repository";
import { digestScheduleSlotRepairPlan, type ScheduleSlotRepairPlan } from "../src/domain/schedule-slot-inventory-repair";

const plan: ScheduleSlotRepairPlan = {
  entries: [
    {
      slotId: 100,
      kind: "repair_replace",
      reasons: ["service_deleted"],
      replacement: { serviceId: 11, technicianServiceId: 21 },
      candidateCount: 1,
      original: {
        availabilityId: 200,
        serviceId: 10,
        technicianServiceId: 20,
        shopId: 3,
        technicianProfileId: 5,
        startsAt: "2026-09-12T01:00:00.000Z",
        endsAt: "2026-09-12T02:00:00.000Z",
        capacity: 1,
        status: "AVAILABLE"
      }
    },
    {
      slotId: 101,
      kind: "repair_remove",
      reasons: ["service_deleted"],
      replacement: null,
      candidateCount: 0,
      original: {
        availabilityId: 201,
        serviceId: 10,
        technicianServiceId: null,
        shopId: 3,
        technicianProfileId: 5,
        startsAt: "2026-09-12T03:00:00.000Z",
        endsAt: "2026-09-12T04:00:00.000Z",
        capacity: 1,
        status: "AVAILABLE"
      }
    }
  ],
  summary: { scanned: 2, current: 0, stale: 2, protected: 0, replace: 1, remove: 1 }
};

describe("ScheduleSlotInventoryRepairRepository", () => {
  it("rechecks the digest, bulk creates replacements, soft-deletes originals, and audits in one transaction", async () => {
    const transaction = {
      scheduleSlot: {
        createMany: jest.fn(async () => ({ count: 1 })),
        updateMany: jest.fn(async () => ({ count: 2 }))
      },
      auditLog: { createMany: jest.fn(async () => ({ count: 2 })) }
    };
    const client = {
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction))
    };
    const repository = new ScheduleSlotInventoryRepairRepository(client as never);
    repository.buildPlan = jest.fn(async () => plan);
    const digest = digestScheduleSlotRepairPlan(plan);

    await expect(
      repository.applyPlan({
        actorId: 7,
        now: new Date("2026-09-11T00:00:00.000Z"),
        plan,
        planDigest: digest,
        batchId: "batch-1"
      })
    ).resolves.toEqual({ batchId: "batch-1", replaced: 1, removed: 1 });

    expect(repository.buildPlan).toHaveBeenCalledWith(
      new Date("2026-09-11T00:00:00.000Z"),
      transaction
    );
    expect(transaction.scheduleSlot.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          serviceId: 11,
          technicianServiceId: 21,
          shopId: 3,
          technicianProfileId: 5,
          startsAt: new Date("2026-09-12T01:00:00.000Z"),
          endsAt: new Date("2026-09-12T02:00:00.000Z"),
          bookedCount: 0,
          status: "AVAILABLE",
          manualBookingIdempotencyKey: "stale-slot-repair:batch-1:100",
          manualBookingRequestFingerprint: digest
        })
      ]
    });
    expect(transaction.scheduleSlot.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [100, 101] },
        deletedAt: null,
        status: "AVAILABLE",
        bookedCount: 0,
        bookingOrders: { none: {} },
        routeEstimates: { none: {} },
        exchangeClaims: { none: {} },
        exchangeMatchParticipants: { none: {} }
      },
      data: { status: "BLOCKED", deletedAt: expect.any(Date) }
    });
    expect(transaction.auditLog.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          actorId: 7,
          action: "schedule_slot.stale_inventory_repair.apply",
          targetType: "ScheduleSlot",
          targetId: 100,
          metadata: expect.objectContaining({
            batchId: "batch-1",
            replacementKey: "stale-slot-repair:batch-1:100"
          })
        })
      ])
    });
  });

  it("rolls back only an unused replacement and appends rollback audit evidence", async () => {
    const transaction = {
      auditLog: {
        count: jest.fn(async () => 0),
        findMany: jest.fn(async () => [
          {
            targetId: 100,
            metadata: {
              batchId: "batch-1",
              replacementKey: "stale-slot-repair:batch-1:100",
              kind: "repair_replace"
            }
          }
        ]),
        createMany: jest.fn(async () => ({ count: 1 }))
      },
      scheduleSlot: {
        findMany: jest.fn(async () => [
          {
            id: 500,
            manualBookingIdempotencyKey: "stale-slot-repair:batch-1:100",
            status: "AVAILABLE",
            bookedCount: 0,
            _count: { bookingOrders: 0, routeEstimates: 0, exchangeClaims: 0, exchangeMatchParticipants: 0 }
          }
        ]),
        updateMany: jest.fn(async () => ({ count: 1 }))
      }
    };
    const client = {
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction))
    };
    const repository = new ScheduleSlotInventoryRepairRepository(client as never);

    await expect(
      repository.rollbackBatch({ actorId: 8, batchId: "batch-1", now: new Date("2026-09-11T02:00:00.000Z") })
    ).resolves.toEqual({ batchId: "batch-1", restored: 1, replacementsRemoved: 1 });
    expect(transaction.scheduleSlot.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: [500] }, deletedAt: null },
      data: { status: "BLOCKED", deletedAt: new Date("2026-09-11T02:00:00.000Z") }
    });
    expect(transaction.scheduleSlot.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: [100] }, deletedAt: { not: null } },
      data: { status: "AVAILABLE", deletedAt: null }
    });
    expect(transaction.auditLog.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ action: "schedule_slot.stale_inventory_repair.rollback", actorId: 8, targetId: 100 })]
    });
  });

  it("refuses rollback after a replacement acquires any business relation", async () => {
    const transaction = {
      auditLog: {
        count: jest.fn(async () => 0),
        findMany: jest.fn(async () => [
          { targetId: 100, metadata: { batchId: "batch-1", replacementKey: "stale-slot-repair:batch-1:100", kind: "repair_replace" } }
        ])
      },
      scheduleSlot: {
        findMany: jest.fn(async () => [
          {
            id: 500,
            manualBookingIdempotencyKey: "stale-slot-repair:batch-1:100",
            status: "BOOKED",
            bookedCount: 1,
            _count: { bookingOrders: 1, routeEstimates: 0, exchangeClaims: 0, exchangeMatchParticipants: 0 }
          }
        ])
      }
    };
    const client = { $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)) };
    const repository = new ScheduleSlotInventoryRepairRepository(client as never);

    await expect(repository.rollbackBatch({ actorId: 8, batchId: "batch-1", now: new Date() })).rejects.toThrow(
      "replacement slot 500 has business usage"
    );
  });
});
