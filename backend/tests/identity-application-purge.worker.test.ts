import { IdentityApplicationPurgeWorker } from "../src/workers/identity-application-purge.worker";

describe("IdentityApplicationPurgeWorker", () => {
  it("reports an anonymized batch summary and never overlaps runs", async () => {
    let resolveRun: ((value: { purged: number; failed: number }) => void) | undefined;
    const purgeDue = jest.fn().mockImplementation(
      () =>
        new Promise<{ purged: number; failed: number }>((resolve) => {
          resolveRun = resolve;
        })
    );
    const logger = { info: jest.fn(), error: jest.fn() };
    const worker = new IdentityApplicationPurgeWorker(
      { purgeDue },
      logger,
      60_000,
      () => new Date("2026-09-25T05:00:00.000Z")
    );

    const first = worker.runOnce();
    await worker.runOnce();
    expect(purgeDue).toHaveBeenCalledTimes(1);
    resolveRun?.({ purged: 3, failed: 0 });
    await first;

    expect(logger.info).toHaveBeenCalledWith(
      { purged: 3, failed: 0 },
      "Identity application private-data purge completed"
    );
  });
});
