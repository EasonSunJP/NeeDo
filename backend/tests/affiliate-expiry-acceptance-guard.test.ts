import {
  AffiliateTaskExpiryService,
  type AffiliateTaskExpiryRepositoryPort
} from "../src/services/affiliate-task-expiry.service";
import type { AffiliateBudgetLedgerPort } from "../src/services/affiliate-task.service";
import {
  FixtureOwnedAffiliateTaskExpiryRepository,
  requireSuccessfulExpirySummary,
  resolveProductionRaceOutcome
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
    const repository = new FixtureOwnedAffiliateTaskExpiryRepository(delegate, new Set([11, 12]));

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

  it("accepts a fulfilled production race without running rollback verification", async () => {
    const committedRollback = jest.fn();

    await expect(
      resolveProductionRaceOutcome({
        initial: { status: "fulfilled", value: "committed" },
        verifyRollback: committedRollback
      })
    ).resolves.toBe("committed");

    expect(committedRollback).not.toHaveBeenCalled();
  });

  it("verifies rollback and propagates a rejected production race without retrying it", async () => {
    const events: string[] = [];
    const verifyRollback = jest.fn(async () => {
      events.push("rollback");
    });
    const rejection = new Error("MySQL deadlock 1213 after production retries");

    await expect(
      resolveProductionRaceOutcome({
        initial: { status: "rejected", reason: rejection },
        verifyRollback
      })
    ).rejects.toBe(rejection);
    expect(verifyRollback).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["rollback"]);
  });

  it("surfaces rollback verification failure before the rejected race error", async () => {
    const rollbackFailure = new Error("outer booking finance partially committed");
    const verifyRollback = jest.fn().mockRejectedValue(rollbackFailure);
    const deadlock = Object.assign(new Error("MySQL deadlock 1213"), { code: "P2034" });

    await expect(
      resolveProductionRaceOutcome({
        initial: { status: "rejected", reason: deadlock },
        verifyRollback
      })
    ).rejects.toBe(rollbackFailure);
    expect(verifyRollback).toHaveBeenCalledTimes(1);
  });

  it("never accepts or retries a fulfilled expiry summary that reports candidate failure", async () => {
    const verifyRollback = jest.fn();

    await expect(
      resolveProductionRaceOutcome({
        initial: { status: "fulfilled", value: { failed: 1, releasedNdp: 0 } },
        verifyRollback,
        validateFulfilled: requireSuccessfulExpirySummary
      })
    ).rejects.toThrow("fulfilled expireDue summary reported candidate failure");
    expect(verifyRollback).not.toHaveBeenCalled();
  });
});
