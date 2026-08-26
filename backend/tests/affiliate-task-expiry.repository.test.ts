import { AffiliateTaskExpiryRepository } from "../src/repositories/affiliate-task-expiry.repository";
import { AffiliateTaskExpiryService } from "../src/services/affiliate-task-expiry.service";

const now = new Date("2026-10-01T00:00:00.000Z");

const taskRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 71,
  publisherType: "MERCHANT_ACCOUNT",
  publisherMerchantAccountId: 41,
  publisherShopId: null,
  status: "ACTIVE",
  taskStartsAt: new Date("2026-09-01T00:00:00.000Z"),
  taskEndsAt: new Date("2026-09-30T00:00:00.000Z"),
  rewardNdpPerCompletedOrder: 100,
  totalBudgetNdp: 1_000,
  reservedBudgetNdp: 1_000,
  allocatedBudgetNdp: 0,
  settledBudgetNdp: 0,
  releasedBudgetNdp: 0,
  endedAt: null,
  ...overrides
});

const reservationRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 13,
  taskId: 71,
  walletId: 501,
  totalFrozenNdp: 1_000,
  allocatedNdp: 0,
  capturedNdp: 0,
  releasedNdp: 0,
  status: "ACTIVE",
  idempotencyKey: "affiliate-task:71:reservation",
  frozenAt: new Date("2026-09-01T00:00:00.000Z"),
  releasedAt: null,
  ...overrides
});

const sqlText = (query: { strings?: readonly string[] }): string => query.strings?.join(" ") ?? "";

const ledger = {
  freezeAffiliateTaskBudget: jest.fn(),
  releaseAffiliateTaskBudget: jest.fn()
};

describe("AffiliateTaskExpiryRepository", () => {
  it("exposes the complete expiry persistence contract and composes with the service", () => {
    const repository = new AffiliateTaskExpiryRepository({} as never);
    const service = new AffiliateTaskExpiryService(repository, ledger);

    expect(repository).toEqual(
      expect.objectContaining({
        listExpiryCandidateTaskIds: expect.any(Function),
        runInTransaction: expect.any(Function),
        lockTask: expect.any(Function),
        lockBudgetReservation: expect.any(Function),
        markTaskEnded: expect.any(Function),
        recordBudgetRelease: expect.any(Function),
        createBudgetTransactionLink: expect.any(Function),
        createAuditLog: expect.any(Function)
      })
    );
    expect(service.expireDue).toEqual(expect.any(Function));
  });

  it("reuses a caller transaction client without starting a nested transaction", async () => {
    const transactionClient = { affiliateTask: { findFirst: jest.fn() } };
    const repository = new AffiliateTaskExpiryRepository(transactionClient as never);

    await expect(
      repository.runInTransaction(async (_scopedRepository, scopedClient) => {
        expect(scopedClient).toBe(transactionClient);
        return "reused";
      })
    ).resolves.toBe("reused");
  });

  it("selects only due eligible tasks or ended tasks with positive unallocated NDP in bounded ID order", async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ id: 71 }, { id: 72 }]);
    const repository = new AffiliateTaskExpiryRepository({ $queryRaw: queryRaw } as never);

    await expect(
      repository.listExpiryCandidateTaskIds({ now, batchSize: 25 })
    ).resolves.toEqual([71, 72]);

    const query = sqlText(queryRaw.mock.calls[0][0]);
    expect(query).toContain("affiliate_tasks AS task");
    expect(query).toContain("affiliate_budget_reservations AS reservation");
    expect(query).toContain("task.deleted_at IS NULL");
    expect(query).toContain("reservation.deleted_at IS NULL");
    expect(query).toMatch(/task\.status IN \('scheduled', 'active', 'paused', 'budget_exhausted'\)/);
    expect(query).toContain("task.status = 'ended'");
    expect(query).toContain(
      "reservation.total_frozen_ndp > reservation.allocated_ndp + reservation.captured_ndp + reservation.released_ndp"
    );
    expect(query).toContain("ORDER BY task.id ASC");
    expect(query).toContain("LIMIT");
    expect(query).not.toMatch(/'draft'|'pending_review'|'rejected'|'cancelled'/);
  });

  it("locks and reloads the task before its non-deleted reservation", async () => {
    const events: string[] = [];
    const queryRaw = jest.fn(async (query: { strings?: readonly string[] }) => {
      const queryText = sqlText(query);
      events.push(queryText.includes("affiliate_tasks") ? "task-lock" : "reservation-lock");
      return [{ id: queryText.includes("affiliate_tasks") ? 71 : 13 }];
    });
    const findTask = jest.fn(async () => {
      events.push("task-reload");
      return taskRecord();
    });
    const findReservation = jest.fn(async () => {
      events.push("reservation-reload");
      return reservationRecord();
    });
    const repository = new AffiliateTaskExpiryRepository({
      $queryRaw: queryRaw,
      affiliateTask: { findFirst: findTask },
      affiliateBudgetReservation: { findFirst: findReservation }
    } as never);

    await expect(repository.lockTask(71)).resolves.toMatchObject({ status: "active" });
    await expect(repository.lockBudgetReservation(71)).resolves.toMatchObject({ status: "active" });

    expect(events).toEqual(["task-lock", "task-reload", "reservation-lock", "reservation-reload"]);
    expect(sqlText(queryRaw.mock.calls[0][0])).toContain("FOR UPDATE");
    expect(sqlText(queryRaw.mock.calls[0][0])).toContain("deleted_at IS NULL");
    expect(sqlText(queryRaw.mock.calls[1][0])).toContain("FOR UPDATE");
    expect(sqlText(queryRaw.mock.calls[1][0])).toContain("deleted_at IS NULL");
    expect(findTask).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 71, deletedAt: null },
        select: expect.objectContaining({ id: true, endedAt: true, releasedBudgetNdp: true })
      })
    );
    expect(findReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 13, deletedAt: null },
        select: expect.objectContaining({ id: true, releasedNdp: true, releasedAt: true })
      })
    );
  });

  it("ends once without changing historical reserved budget and cumulatively releases cleared budget", async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ id: 71 }])
      .mockResolvedValueOnce([{ id: 13 }]);
    const updateTask = jest.fn().mockResolvedValue({ count: 1 });
    const updateReservation = jest.fn().mockResolvedValue({ count: 1 });
    const repository = new AffiliateTaskExpiryRepository({
      $queryRaw: queryRaw,
      affiliateTask: { findFirst: jest.fn().mockResolvedValue(taskRecord()), updateMany: updateTask },
      affiliateBudgetReservation: {
        findFirst: jest.fn().mockResolvedValue(reservationRecord()),
        updateMany: updateReservation
      }
    } as never);

    await repository.lockTask(71);
    await repository.lockBudgetReservation(71);
    await repository.markTaskEnded({ taskId: 71, expectedStatus: "active", endedAt: now });
    await repository.recordBudgetRelease({
      taskId: 71,
      reservationId: 13,
      releasedAfterNdp: 1_000,
      reservationStatus: "released",
      releasedAt: now
    });

    expect(updateTask).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 71,
          status: "ACTIVE",
          reservedBudgetNdp: 1_000,
          releasedBudgetNdp: 0,
          deletedAt: null
        }),
        data: { status: "ENDED", endedAt: now, lockVersion: { increment: 1 } }
      })
    );
    expect(updateTask).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ status: "ENDED", releasedBudgetNdp: 0 }),
        data: { releasedBudgetNdp: { increment: 1_000 } }
      })
    );
    expect(updateReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 13,
          taskId: 71,
          status: "ACTIVE",
          totalFrozenNdp: 1_000,
          allocatedNdp: 0,
          capturedNdp: 0,
          releasedNdp: 0,
          deletedAt: null
        }),
        data: {
          releasedNdp: { increment: 1_000 },
          status: "RELEASED",
          releasedAt: now
        }
      })
    );
  });

  it("preserves an active or exhausted reservation until its frozen budget is fully cleared", async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ id: 71 }])
      .mockResolvedValueOnce([{ id: 13 }]);
    const updateReservation = jest.fn().mockResolvedValue({ count: 1 });
    const repository = new AffiliateTaskExpiryRepository({
      $queryRaw: queryRaw,
      affiliateTask: {
        findFirst: jest.fn().mockResolvedValue(taskRecord({ status: "ENDED", releasedBudgetNdp: 100 })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      affiliateBudgetReservation: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            reservationRecord({ allocatedNdp: 300, capturedNdp: 100, releasedNdp: 100, status: "EXHAUSTED" })
          ),
        updateMany: updateReservation
      }
    } as never);

    await repository.lockTask(71);
    await repository.lockBudgetReservation(71);
    await repository.recordBudgetRelease({
      taskId: 71,
      reservationId: 13,
      releasedAfterNdp: 600,
      reservationStatus: "exhausted",
      releasedAt: null
    });

    expect(updateReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { releasedNdp: { increment: 500 }, status: "EXHAUSTED", releasedAt: null }
      })
    );
  });

  it("persists same-transaction budget links and system audits with required metadata", async () => {
    const createLink = jest.fn().mockResolvedValue({});
    const createAudit = jest.fn().mockResolvedValue({});
    const repository = new AffiliateTaskExpiryRepository({
      affiliateBudgetTransaction: { create: createLink },
      auditLog: { create: createAudit }
    } as never);
    const metadata = {
      taskId: 71,
      reservationId: 13,
      releaseAmountNdp: 900,
      releasedBeforeNdp: 0,
      releasedAfterNdp: 900,
      allocatedNdp: 100,
      capturedNdp: 0,
      ledgerTransactionId: 88
    };

    await repository.createBudgetTransactionLink({
      reservationId: 13,
      ledgerTransactionId: 88,
      kind: "release",
      amountNdp: 900
    });
    await repository.createAuditLog({
      actorUserId: null,
      action: "affiliate.task.expiry_budget_released",
      taskId: 71,
      metadata
    });

    expect(createLink).toHaveBeenCalledWith({
      data: { budgetReservationId: 13, ledgerTransactionId: 88, kind: "RELEASE", amountNdp: 900 }
    });
    expect(createAudit).toHaveBeenCalledWith({
      data: {
        actorId: null,
        action: "affiliate.task.expiry_budget_released",
        targetType: "affiliate_task",
        targetId: 71,
        metadata
      }
    });
  });

  it("throws a stable conflict when a guarded aggregate update does not affect exactly one row", async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ id: 71 }])
      .mockResolvedValueOnce([{ id: 13 }]);
    const repository = new AffiliateTaskExpiryRepository({
      $queryRaw: queryRaw,
      affiliateTask: {
        findFirst: jest.fn().mockResolvedValue(taskRecord({ status: "ENDED" })),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      },
      affiliateBudgetReservation: {
        findFirst: jest.fn().mockResolvedValue(reservationRecord()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      }
    } as never);

    await repository.lockTask(71);
    await repository.lockBudgetReservation(71);

    await expect(
      repository.recordBudgetRelease({
        taskId: 71,
        reservationId: 13,
        releasedAfterNdp: 1_000,
        reservationStatus: "released",
        releasedAt: now
      })
    ).rejects.toThrow("error.affiliate.task_expiry_conflict");
  });
});
