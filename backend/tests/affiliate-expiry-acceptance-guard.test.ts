import {
  AffiliateTaskExpiryService,
  type AffiliateTaskExpiryRepositoryPort
} from "../src/services/affiliate-task-expiry.service";
import type { AffiliateBudgetLedgerPort } from "../src/services/affiliate-task.service";
import {
  FixtureOwnedAffiliateTaskExpiryRepository,
  requireSuccessfulExpirySummary,
  resolveVerifiedDeadlockVictim
} from "../scripts/lib/affiliate-expiry-acceptance-guard";

const createDelegate = (candidateIds: number[]) => {
  const delegate: jest.Mocked<AffiliateTaskExpiryRepositoryPort> = {
    listExpiryCandidateTaskIds: jest.fn().mockResolvedValue(candidateIds),
    runInTransaction: jest.fn(),
    lockTask: jest.fn(),
    lockBudgetReservation: jest.fn(),
    markTaskEnded: jest.fn(),
    recordBudgetRelease: jest.fn(),
    createBudgetTransactionLink: jest.fn(),
    createAuditLog: jest.fn()
  };
  return delegate;
};

const createService = (repository: AffiliateTaskExpiryRepositoryPort) =>
  new AffiliateTaskExpiryService(repository, {
    freezeAffiliateTaskBudget: jest.fn(),
    releaseAffiliateTaskBudget: jest.fn()
  } satisfies AffiliateBudgetLedgerPort);

describe("affiliate expiry acceptance guard", () => {
  it("delegates an allowed page with the exact keyset input and result", async () => {
    const input = {
      now: new Date("2026-08-26T00:00:00.000Z"),
      batchSize: 2,
      afterTaskId: 0
    };
    const candidateIds = [11, 12];
    const delegate = createDelegate(candidateIds);
    const repository = new FixtureOwnedAffiliateTaskExpiryRepository(
      delegate,
      new Set([11, 12])
    );

    await expect(repository.listExpiryCandidateTaskIds(input)).resolves.toBe(candidateIds);
    expect(delegate.listExpiryCandidateTaskIds).toHaveBeenCalledTimes(1);
    expect(delegate.listExpiryCandidateTaskIds).toHaveBeenCalledWith(input);
  });

  it("rejects a foreign first-page candidate before any transaction or mutation", async () => {
    const delegate = createDelegate([11, 99]);
    const repository = new FixtureOwnedAffiliateTaskExpiryRepository(delegate, new Set([11]));

    await expect(
      createService(repository).expireDue({
        now: new Date("2026-08-26T00:00:00.000Z"),
        batchSize: 10
      })
    ).rejects.toThrow("fixture-owned expiry candidate allow-set rejected task: 99");
    expect(delegate.runInTransaction).not.toHaveBeenCalled();
    expect(delegate.markTaskEnded).not.toHaveBeenCalled();
    expect(delegate.recordBudgetRelease).not.toHaveBeenCalled();
  });

  it("rejects a foreign keyset-page candidate before any transaction or mutation", async () => {
    const delegate = createDelegate([51, 77]);
    const repository = new FixtureOwnedAffiliateTaskExpiryRepository(delegate, new Set([51]));
    const input = {
      now: new Date("2026-08-26T00:00:00.000Z"),
      batchSize: 10,
      afterTaskId: 50
    };

    await expect(repository.listExpiryCandidateTaskIds(input)).rejects.toThrow(
      "fixture-owned expiry candidate allow-set rejected task: 77"
    );
    expect(delegate.listExpiryCandidateTaskIds).toHaveBeenCalledWith(input);
    expect(delegate.runInTransaction).not.toHaveBeenCalled();
    expect(delegate.createBudgetTransactionLink).not.toHaveBeenCalled();
    expect(delegate.createAuditLog).not.toHaveBeenCalled();
  });

  it("retries only the rejected verified-deadlock victim after rollback verification", async () => {
    const committedRetry = jest.fn();
    const committedRollback = jest.fn();
    const victimOrder: string[] = [];
    const victimRollback = jest.fn(async () => {
      victimOrder.push("rollback");
    });
    const victimRetry = jest.fn(async () => {
      victimOrder.push("retry");
      return "retried";
    });
    const deadlock = Object.assign(new Error("MySQL deadlock 1213"), { code: "P2034" });

    await expect(
      resolveVerifiedDeadlockVictim({
        initial: { status: "fulfilled", value: "committed" },
        retry: committedRetry,
        verifyRollback: committedRollback
      })
    ).resolves.toEqual({ value: "committed", retried: false });
    await expect(
      resolveVerifiedDeadlockVictim({
        initial: { status: "rejected", reason: deadlock },
        retry: victimRetry,
        verifyRollback: victimRollback
      })
    ).resolves.toEqual({ value: "retried", retried: true });

    expect(committedRetry).not.toHaveBeenCalled();
    expect(committedRollback).not.toHaveBeenCalled();
    expect(victimRetry).toHaveBeenCalledTimes(1);
    expect(victimRollback).toHaveBeenCalledTimes(1);
    expect(victimOrder).toEqual(["rollback", "retry"]);
  });

  it("propagates a non-deadlock rejection without rollback verification or retry", async () => {
    const retry = jest.fn();
    const verifyRollback = jest.fn();
    const rejection = new Error("validation conflict");

    await expect(
      resolveVerifiedDeadlockVictim({
        initial: { status: "rejected", reason: rejection },
        retry,
        verifyRollback
      })
    ).rejects.toBe(rejection);
    expect(retry).not.toHaveBeenCalled();
    expect(verifyRollback).not.toHaveBeenCalled();
  });

  it("never accepts or retries a fulfilled expiry summary that reports candidate failure", async () => {
    const retry = jest.fn();
    const verifyRollback = jest.fn();

    await expect(
      resolveVerifiedDeadlockVictim({
        initial: { status: "fulfilled", value: { failed: 1, releasedNdp: 0 } },
        retry,
        verifyRollback,
        validateFulfilled: requireSuccessfulExpirySummary
      })
    ).rejects.toThrow("fulfilled expireDue summary reported candidate failure");
    expect(retry).not.toHaveBeenCalled();
    expect(verifyRollback).not.toHaveBeenCalled();
  });
});
