import {
  AffiliateTaskExpiryService,
  type AffiliateTaskExpiryRepositoryPort,
  type AffiliateTaskExpiryTaskRecord,
  type AffiliateTaskExpiryTransactionClient
} from "../src/services/affiliate-task-expiry.service";
import type { AffiliateBudgetReservationRecord } from "../src/services/affiliate-task.service";
import type {
  AffiliateBudgetLedgerResult,
  ReleaseAffiliateTaskBudgetInput
} from "../src/services/ledger.service";
import type { AffiliateBudgetLedgerPort } from "../src/services/affiliate-task.service";

const now = new Date("2026-10-01T00:00:00.000Z");
const endedAt = new Date("2026-09-30T00:00:00.000Z");

const task = (
  overrides: Partial<AffiliateTaskExpiryTaskRecord> = {}
): AffiliateTaskExpiryTaskRecord => ({
  id: 71,
  publisherType: "merchant_account",
  publisherMerchantAccountId: 41,
  publisherShopId: null,
  status: "active",
  taskStartsAt: new Date("2026-09-01T00:00:00.000Z"),
  taskEndsAt: endedAt,
  rewardNdpPerCompletedOrder: 100,
  totalBudgetNdp: 1_000,
  reservedBudgetNdp: 1_000,
  allocatedBudgetNdp: 0,
  settledBudgetNdp: 0,
  releasedBudgetNdp: 0,
  endedAt: null,
  ...overrides
});

const reservation = (
  overrides: Partial<AffiliateBudgetReservationRecord> = {}
): AffiliateBudgetReservationRecord => ({
  id: 13,
  taskId: 71,
  walletId: 501,
  totalFrozenNdp: 1_000,
  allocatedNdp: 0,
  capturedNdp: 0,
  releasedNdp: 0,
  status: "active",
  idempotencyKey: "affiliate-task:71:reservation",
  frozenAt: new Date("2026-09-01T00:00:00.000Z"),
  releasedAt: null,
  ...overrides
});

class TransactionalExpiryRepository implements AffiliateTaskExpiryRepositoryPort {
  public tasks = new Map<number, AffiliateTaskExpiryTaskRecord>();
  public reservations = new Map<number, AffiliateBudgetReservationRecord>();
  public links: Array<{
    reservationId: number;
    ledgerTransactionId: number;
    kind: "release";
    amountNdp: number;
  }> = [];
  public audits: Array<{
    actorUserId: number | null;
    action: string;
    taskId: number;
    metadata?: unknown;
  }> = [];
  public candidateIds: number[] = [];
  public candidateInputs: Array<{ now: Date; batchSize: number }> = [];

  public seed(inputTask: AffiliateTaskExpiryTaskRecord, inputReservation: AffiliateBudgetReservationRecord) {
    this.tasks.set(inputTask.id, inputTask);
    this.reservations.set(inputTask.id, inputReservation);
    this.candidateIds.push(inputTask.id);
  }

  public async listExpiryCandidateTaskIds(input: {
    now: Date;
    batchSize: number;
  }): Promise<number[]> {
    this.candidateInputs.push(input);
    return this.candidateIds;
  }

  public async runInTransaction<T>(
    handler: (
      repository: AffiliateTaskExpiryRepositoryPort,
      transactionClient?: AffiliateTaskExpiryTransactionClient
    ) => Promise<T>
  ): Promise<T> {
    const tasks = structuredClone([...this.tasks.entries()]);
    const reservations = structuredClone([...this.reservations.entries()]);
    const links = structuredClone(this.links);
    const audits = structuredClone(this.audits);

    try {
      return await handler(this, { expiryTransaction: true });
    } catch (error) {
      this.tasks = new Map(tasks);
      this.reservations = new Map(reservations);
      this.links.splice(0, this.links.length, ...links);
      this.audits.splice(0, this.audits.length, ...audits);
      throw error;
    }
  }

  public async lockTask(taskId: number): Promise<AffiliateTaskExpiryTaskRecord | null> {
    return this.tasks.get(taskId) ?? null;
  }

  public async lockBudgetReservation(
    taskId: number
  ): Promise<AffiliateBudgetReservationRecord | null> {
    return this.reservations.get(taskId) ?? null;
  }

  public async markTaskEnded(input: {
    taskId: number;
    expectedStatus: "scheduled" | "active" | "paused" | "budget_exhausted";
    endedAt: Date;
  }): Promise<void> {
    const current = this.tasks.get(input.taskId);
    if (!current || current.status !== input.expectedStatus) {
      throw new Error("missing task");
    }
    current.status = "ended";
    current.endedAt = input.endedAt;
  }

  public async recordBudgetRelease(input: {
    taskId: number;
    reservationId: number;
    releasedAfterNdp: number;
    reservationStatus: "active" | "released" | "exhausted";
    releasedAt: Date | null;
  }): Promise<void> {
    const currentTask = this.tasks.get(input.taskId);
    const currentReservation = this.reservations.get(input.taskId);
    if (!currentTask || !currentReservation || currentReservation.id !== input.reservationId) {
      throw new Error("missing budget reservation");
    }
    currentTask.releasedBudgetNdp = input.releasedAfterNdp;
    currentReservation.releasedNdp = input.releasedAfterNdp;
    currentReservation.status = input.reservationStatus;
    currentReservation.releasedAt = input.releasedAt;
  }

  public async createBudgetTransactionLink(input: {
    reservationId: number;
    ledgerTransactionId: number;
    kind: "release";
    amountNdp: number;
  }): Promise<void> {
    this.links.push(input);
  }

  public async createAuditLog(input: {
    actorUserId: number | null;
    action: string;
    taskId: number;
    metadata?: unknown;
  }): Promise<void> {
    this.audits.push(input);
  }
}

class AffiliateBudgetLedgerSpy implements AffiliateBudgetLedgerPort {
  public calls: ReleaseAffiliateTaskBudgetInput[] = [];
  public failTaskIds = new Set<number>();
  private nextTransactionId = 1;

  public async freezeAffiliateTaskBudget(): Promise<AffiliateBudgetLedgerResult> {
    throw new Error("freeze is outside expiry processing");
  }

  public async releaseAffiliateTaskBudget(
    input: ReleaseAffiliateTaskBudgetInput
  ): Promise<AffiliateBudgetLedgerResult> {
    this.calls.push(input);
    if (this.failTaskIds.has(input.taskId)) {
      throw new Error(`ledger failure for ${input.taskId}`);
    }
    return {
      walletId: input.walletId,
      transaction: {
        id: this.nextTransactionId++
      } as AffiliateBudgetLedgerResult["transaction"]
    };
  }
}

const createFixture = () => {
  const repository = new TransactionalExpiryRepository();
  const ledger = new AffiliateBudgetLedgerSpy();
  const service = new AffiliateTaskExpiryService(repository, ledger);
  return { repository, ledger, service };
};

const expire = (service: AffiliateTaskExpiryService) =>
  service.expireDue({ now, batchSize: 20 });

describe("AffiliateTaskExpiryService", () => {
  it("ends a due active task and releases its complete unallocated budget", async () => {
    const { repository, ledger, service } = createFixture();
    repository.seed(task(), reservation());

    await expect(expire(service)).resolves.toEqual({
      scanned: 1,
      ended: 1,
      released: 1,
      failed: 0,
      releasedNdp: 1_000
    });
    expect(repository.tasks.get(71)).toMatchObject({ status: "ended", endedAt: now });
    expect(repository.reservations.get(71)).toMatchObject({
      releasedNdp: 1_000,
      status: "released",
      releasedAt: now
    });
    expect(ledger.calls).toEqual([
      expect.objectContaining({
        amountNdp: 1_000,
        actorUserId: null,
        idempotencyKey: "affiliate-task:71:expiry-release:to:1000"
      })
    ]);
    expect(repository.audits.map((audit) => audit.action)).toEqual([
      "affiliate.task.expired",
      "affiliate.task.expiry_budget_released"
    ]);
    expect(repository.audits.every((audit) => audit.actorUserId === null)).toBe(true);
  });

  it("releases only the remainder after captured NDP", async () => {
    const { repository, ledger, service } = createFixture();
    repository.seed(
      task({ settledBudgetNdp: 200 }),
      reservation({ capturedNdp: 200 })
    );

    await expire(service);

    expect(ledger.calls[0]).toMatchObject({ amountNdp: 800 });
    expect(repository.reservations.get(71)).toMatchObject({ releasedNdp: 800, status: "released" });
  });

  it("preserves allocated NDP and releases only the unallocated remainder", async () => {
    const { repository, ledger, service } = createFixture();
    repository.seed(
      task({ allocatedBudgetNdp: 300 }),
      reservation({ allocatedNdp: 300 })
    );

    await expire(service);

    expect(ledger.calls[0]).toMatchObject({ amountNdp: 700 });
    expect(repository.reservations.get(71)).toMatchObject({
      allocatedNdp: 300,
      releasedNdp: 700,
      status: "active"
    });
  });

  it("ends a task with no unallocated NDP without creating a zero ledger release", async () => {
    const { repository, ledger, service } = createFixture();
    repository.seed(
      task({ settledBudgetNdp: 1_000 }),
      reservation({ capturedNdp: 1_000 })
    );

    await expect(expire(service)).resolves.toEqual({
      scanned: 1,
      ended: 1,
      released: 0,
      failed: 0,
      releasedNdp: 0
    });
    expect(ledger.calls).toHaveLength(0);
    expect(repository.reservations.get(71)).toMatchObject({ status: "released" });
  });

  it("releases newly unallocated NDP for an ended task without rewriting endedAt", async () => {
    const { repository, ledger, service } = createFixture();
    const originalEndedAt = new Date("2026-09-30T01:00:00.000Z");
    repository.seed(
      task({ status: "ended", endedAt: originalEndedAt, releasedBudgetNdp: 200 }),
      reservation({ releasedNdp: 200 })
    );

    await expect(expire(service)).resolves.toEqual({
      scanned: 1,
      ended: 0,
      released: 1,
      failed: 0,
      releasedNdp: 800
    });
    expect(ledger.calls[0]).toMatchObject({ amountNdp: 800 });
    expect(repository.tasks.get(71)?.endedAt).toEqual(originalEndedAt);
  });

  it("does not duplicate a release when the batch runs twice", async () => {
    const { repository, ledger, service } = createFixture();
    repository.seed(task(), reservation());

    await expire(service);
    await expect(expire(service)).resolves.toEqual({
      scanned: 1,
      ended: 0,
      released: 0,
      failed: 0,
      releasedNdp: 0
    });
    expect(ledger.calls).toHaveLength(1);
  });

  it("isolates candidate failures so another task can expire and release", async () => {
    const { repository, ledger, service } = createFixture();
    repository.seed(task({ id: 71 }), reservation({ taskId: 71 }));
    repository.seed(task({ id: 72 }), reservation({ id: 14, taskId: 72 }));
    ledger.failTaskIds.add(71);

    await expect(expire(service)).resolves.toEqual({
      scanned: 2,
      ended: 1,
      released: 1,
      failed: 1,
      releasedNdp: 1_000
    });
    expect(repository.tasks.get(71)).toMatchObject({ status: "active", endedAt: null });
    expect(repository.tasks.get(72)).toMatchObject({ status: "ended", endedAt: now });
    expect(repository.links).toHaveLength(1);
  });

  it.each([
    {
      name: "an unsafe budget counter",
      inputTask: task({ allocatedBudgetNdp: Number.MAX_SAFE_INTEGER + 1 }),
      inputReservation: reservation({ allocatedNdp: Number.MAX_SAFE_INTEGER + 1 })
    },
    {
      name: "a task and reservation aggregate mismatch",
      inputTask: task({ releasedBudgetNdp: 100 }),
      inputReservation: reservation({ releasedNdp: 0 })
    }
  ])("rolls back $name before wallet or domain mutation", async ({ inputTask, inputReservation }) => {
    const { repository, ledger, service } = createFixture();
    repository.seed(inputTask, inputReservation);

    await expect(expire(service)).resolves.toEqual({
      scanned: 1,
      ended: 0,
      released: 0,
      failed: 1,
      releasedNdp: 0
    });
    expect(ledger.calls).toHaveLength(0);
    expect(repository.tasks.get(71)).toEqual(inputTask);
    expect(repository.reservations.get(71)).toEqual(inputReservation);
    expect(repository.links).toHaveLength(0);
    expect(repository.audits).toHaveLength(0);
  });

  it("uses the cumulative release amount in the expiry idempotency key", async () => {
    const { repository, ledger, service } = createFixture();
    repository.seed(
      task({ settledBudgetNdp: 200, releasedBudgetNdp: 100 }),
      reservation({ capturedNdp: 200, releasedNdp: 100 })
    );

    await expire(service);

    expect(ledger.calls[0]).toMatchObject({
      amountNdp: 700,
      idempotencyKey: "affiliate-task:71:expiry-release:to:800"
    });
  });

  it("requests and processes no more than batchSize candidate ids", async () => {
    const { repository, service } = createFixture();
    repository.seed(task({ id: 71 }), reservation({ taskId: 71 }));
    repository.seed(task({ id: 72 }), reservation({ id: 14, taskId: 72 }));

    await service.expireDue({ now, batchSize: 1 });

    expect(repository.candidateInputs).toEqual([{ now, batchSize: 1 }]);
    expect(repository.tasks.get(71)?.status).toBe("ended");
    expect(repository.tasks.get(72)?.status).toBe("active");
  });
});
