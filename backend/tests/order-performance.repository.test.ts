import {
  OrderPerformanceRepository,
  type OrderPerformanceCommand
} from "../src/repositories/order-performance.repository";

const now = new Date("2026-09-01T04:00:00.000Z");

const baseAssessment = {
  id: 41,
  bookingOrderId: 71,
  technicianProfileId: 31,
  outcome: "TECHNICIAN_UNCOMPLETED",
  treatment: "COUNTED",
  version: 1,
  currentRevisionId: 91,
  createdAt: now,
  updatedAt: now,
  deletedAt: null
};

const baseCommand: OrderPerformanceCommand = {
  bookingOrderId: 71,
  actorUserId: 9,
  publicReason: "交通中断による例外対応",
  internalNote: "运营确认 JR 全线停运",
  idempotencyKey: "order-performance-command-0001",
  requestFingerprint: "a".repeat(64),
  expectedRevision: 1,
  auditLog: {
    actorId: 9,
    action: "order_performance.special_exclusion.apply",
    targetType: "booking_order",
    targetId: 71,
    ip: "127.0.0.1",
    userAgent: "jest",
    metadata: { source: "test" }
  }
};

const createTransaction = () => ({
  bookingOrder: {
    findFirst: jest.fn().mockResolvedValue({
      id: 71,
      status: "CANCELLED",
      technicianProfileId: 31
    }),
    count: jest.fn().mockResolvedValue(8)
  },
  orderPerformanceAssessment: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({
      ...baseAssessment,
      currentRevisionId: null
    }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    groupBy: jest.fn().mockResolvedValue([
      {
        outcome: "TECHNICIAN_UNCOMPLETED",
        treatment: "COUNTED",
        _count: { _all: 1 }
      }
    ])
  },
  orderPerformanceAssessmentRevision: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 91 }),
    update: jest.fn(),
    delete: jest.fn()
  },
  technicianPerformanceSummary: {
    upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: 1, ...create }))
  },
  auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) }
});

const createRepository = (transaction = createTransaction()) => ({
  transaction,
  repository: new OrderPerformanceRepository({
    $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction)
    )
  } as never)
});

describe("OrderPerformanceRepository", () => {
  it("classifies an explicit uncompleted order and writes assessment, revision, summary, and audit in one transaction", async () => {
    const { repository, transaction } = createRepository();

    await expect(
      repository.classifyTechnicianUncompleted({
        ...baseCommand,
        expectedRevision: 0,
        auditLog: {
          ...baseCommand.auditLog,
          action: "order_performance.technician_uncompleted.classify"
        }
      })
    ).resolves.toMatchObject({
      outcome: "ok",
      replayed: false,
      assessment: {
        bookingOrderId: 71,
        technicianProfileId: 31,
        outcome: "technician_uncompleted",
        treatment: "counted",
        version: 1,
        currentRevisionId: 91
      }
    });

    expect(transaction.orderPerformanceAssessment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingOrderId: 71,
        technicianProfileId: 31,
        outcome: "TECHNICIAN_UNCOMPLETED",
        treatment: "COUNTED",
        version: 1
      })
    });
    expect(transaction.orderPerformanceAssessmentRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CLASSIFY_TECHNICIAN_UNCOMPLETED",
        previousTreatment: null,
        nextTreatment: "COUNTED",
        assessmentVersion: 1
      }),
      select: { id: true }
    });
    expect(transaction.technicianPerformanceSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          completedOrderCount: 8,
          accountableUncompletedCount: 1,
          acceptanceRateBps: 8_889
        })
      })
    );
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("replays the same idempotency key and fingerprint without another write", async () => {
    const transaction = createTransaction();
    transaction.orderPerformanceAssessmentRevision.findFirst.mockResolvedValue({
      requestFingerprint: baseCommand.requestFingerprint,
      assessment: baseAssessment
    });
    const { repository } = createRepository(transaction);

    await expect(repository.applySpecialExclusion(baseCommand)).resolves.toMatchObject({
      outcome: "ok",
      replayed: true,
      assessment: { version: 1 }
    });
    expect(transaction.orderPerformanceAssessment.updateMany).not.toHaveBeenCalled();
    expect(transaction.orderPerformanceAssessmentRevision.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects reuse of an idempotency key with a different fingerprint", async () => {
    const transaction = createTransaction();
    transaction.orderPerformanceAssessmentRevision.findFirst.mockResolvedValue({
      requestFingerprint: "b".repeat(64),
      assessment: baseAssessment
    });
    const { repository } = createRepository(transaction);

    await expect(repository.applySpecialExclusion(baseCommand)).resolves.toEqual({
      outcome: "idempotency_conflict"
    });
    expect(transaction.orderPerformanceAssessment.updateMany).not.toHaveBeenCalled();
  });

  it("rejects stale expected revisions before mutating", async () => {
    const transaction = createTransaction();
    transaction.orderPerformanceAssessment.findFirst.mockResolvedValue({
      ...baseAssessment,
      version: 2
    });
    const { repository } = createRepository(transaction);

    await expect(repository.applySpecialExclusion(baseCommand)).resolves.toEqual({
      outcome: "version_conflict"
    });
    expect(transaction.orderPerformanceAssessment.updateMany).not.toHaveBeenCalled();
  });

  it("allows exclusion only from counted and revocation only from excluded", async () => {
    const excludedTransaction = createTransaction();
    excludedTransaction.orderPerformanceAssessment.findFirst.mockResolvedValue({
      ...baseAssessment,
      treatment: "SPECIAL_EXCLUDED"
    });
    const countedTransaction = createTransaction();
    countedTransaction.orderPerformanceAssessment.findFirst.mockResolvedValue(baseAssessment);

    await expect(
      createRepository(excludedTransaction).repository.applySpecialExclusion(baseCommand)
    ).resolves.toEqual({ outcome: "ineligible" });
    await expect(
      createRepository(countedTransaction).repository.revokeSpecialExclusion(baseCommand)
    ).resolves.toEqual({ outcome: "ineligible" });
  });

  it("rejects explicit uncompleted classification for completed or still-active orders", async () => {
    for (const status of ["COMPLETED", "PENDING", "CONFIRMED", "IN_SERVICE"] as const) {
      const transaction = createTransaction();
      transaction.bookingOrder.findFirst.mockResolvedValue({
        id: 71,
        status,
        technicianProfileId: 31
      });

      await expect(
        createRepository(transaction).repository.classifyTechnicianUncompleted({
          ...baseCommand,
          expectedRevision: 0
        })
      ).resolves.toEqual({ outcome: "ineligible" });
      expect(transaction.orderPerformanceAssessment.create).not.toHaveBeenCalled();
    }
  });

  it("applies and revokes by appending revisions without changing historical rows", async () => {
    const transaction = createTransaction();
    const state = { ...baseAssessment };
    transaction.orderPerformanceAssessment.findFirst.mockImplementation(() =>
      Promise.resolve({ ...state })
    );
    transaction.orderPerformanceAssessment.updateMany.mockImplementation(({ data }) => {
      if (data.treatment) {
        state.treatment = data.treatment;
        state.version += 1;
      }
      if (data.currentRevisionId) {
        state.currentRevisionId = data.currentRevisionId;
      }
      return Promise.resolve({ count: 1 });
    });
    transaction.orderPerformanceAssessmentRevision.create
      .mockResolvedValueOnce({ id: 92 })
      .mockResolvedValueOnce({ id: 93 });
    const { repository } = createRepository(transaction);

    await expect(repository.applySpecialExclusion(baseCommand)).resolves.toMatchObject({
      outcome: "ok",
      assessment: { treatment: "special_excluded", version: 2 }
    });
    await expect(
      repository.revokeSpecialExclusion({
        ...baseCommand,
        idempotencyKey: "order-performance-command-0002",
        requestFingerprint: "c".repeat(64),
        expectedRevision: 2
      })
    ).resolves.toMatchObject({
      outcome: "ok",
      assessment: { treatment: "counted", version: 3 }
    });

    expect(transaction.orderPerformanceAssessmentRevision.create).toHaveBeenCalledTimes(2);
    expect(transaction.orderPerformanceAssessmentRevision.update).not.toHaveBeenCalled();
    expect(transaction.orderPerformanceAssessmentRevision.delete).not.toHaveBeenCalled();
  });
});
