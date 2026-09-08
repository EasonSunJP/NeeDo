import { AffiliateAllianceInvitationExpiryWorker } from "../src/workers/affiliate-alliance-invitation-expiry.worker";

describe("AffiliateAllianceInvitationExpiryWorker", () => {
  afterEach(() => jest.restoreAllMocks());

  it("runs immediately, schedules one unref interval, and stops cleanly", async () => {
    const expireDue = jest
      .fn()
      .mockResolvedValue({ scanned: 2, expired: 2, skipped: 0, failed: 0 });
    const logger = { info: jest.fn(), error: jest.fn() };
    const unref = jest.fn();
    const timer = { unref } as unknown as NodeJS.Timeout;
    jest.spyOn(global, "setInterval").mockReturnValue(timer);
    const clearIntervalSpy = jest
      .spyOn(global, "clearInterval")
      .mockImplementation(() => undefined);
    const now = new Date("2026-08-31T12:00:00.000Z");
    const worker = new AffiliateAllianceInvitationExpiryWorker(
      { expireDue },
      logger,
      300_000,
      100,
      () => now
    );

    worker.start();
    worker.start();
    await Promise.resolve();
    expect(expireDue).toHaveBeenCalledTimes(1);
    expect(expireDue).toHaveBeenCalledWith({ now, batchSize: 100 });
    expect(unref).toHaveBeenCalledTimes(1);
    worker.stop();
    worker.stop();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
  });

  it("prevents overlap and recovers after a logged failure", async () => {
    let release:
      | ((value: { scanned: number; expired: number; skipped: number; failed: number }) => void)
      | undefined;
    const expireDue = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ scanned: number; expired: number; skipped: number; failed: number }>(
            (resolve) => {
              release = resolve;
            }
          )
      )
      .mockRejectedValueOnce(new Error("database unavailable"));
    const logger = { info: jest.fn(), error: jest.fn() };
    const worker = new AffiliateAllianceInvitationExpiryWorker({ expireDue }, logger, 300_000, 100);

    const first = worker.runOnce();
    await worker.runOnce();
    expect(expireDue).toHaveBeenCalledTimes(1);
    release?.({ scanned: 1, expired: 1, skipped: 0, failed: 0 });
    await first;
    await worker.runOnce();
    expect(logger.error).toHaveBeenCalledWith(
      { error: expect.any(Error) },
      "Affiliate alliance invitation expiry failed"
    );
  });
});
