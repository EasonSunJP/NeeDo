import { ShopMembershipCardAdjustmentExpiryWorker } from "../src/workers/shop-membership-card-adjustment-expiry.worker";

describe("ShopMembershipCardAdjustmentExpiryWorker", () => {
  afterEach(() => jest.restoreAllMocks());

  it("starts immediately, schedules the configured interval and logs the batch", async () => {
    const expireDue = jest.fn().mockResolvedValue({ scanned: 4, expired: 3, failed: 1 });
    const logger = { info: jest.fn(), error: jest.fn() };
    const timer = { unref: jest.fn() } as unknown as NodeJS.Timeout;
    const setIntervalSpy = jest.spyOn(global, "setInterval").mockReturnValue(timer);
    const worker = new ShopMembershipCardAdjustmentExpiryWorker({ expireDue }, logger, 300_000, 100);

    worker.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 300_000);
    expect(timer.unref).toHaveBeenCalledTimes(1);
    expect(expireDue).toHaveBeenCalledWith({ batchSize: 100 });
    expect(logger.info).toHaveBeenCalledWith({ scanned: 4, expired: 3, failed: 1 }, "Membership card adjustment expiry completed");
  });

  it("does not overlap runs and recovers after a failure", async () => {
    let resolveRun: ((value: { scanned: number; expired: number; failed: number }) => void) | undefined;
    const expireDue = jest.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRun = resolve; }))
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce({ scanned: 0, expired: 0, failed: 0 });
    const logger = { info: jest.fn(), error: jest.fn() };
    const worker = new ShopMembershipCardAdjustmentExpiryWorker({ expireDue }, logger, 300_000, 100);

    const first = worker.runOnce();
    await worker.runOnce();
    expect(expireDue).toHaveBeenCalledTimes(1);
    resolveRun?.({ scanned: 1, expired: 1, failed: 0 });
    await first;
    await worker.runOnce();
    await worker.runOnce();
    expect(expireDue).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith({ error: expect.any(Error) }, "Membership card adjustment expiry failed");
  });

  it("stops idempotently", () => {
    const timer = { unref: jest.fn() } as unknown as NodeJS.Timeout;
    jest.spyOn(global, "setInterval").mockReturnValue(timer);
    const clearIntervalSpy = jest.spyOn(global, "clearInterval").mockImplementation(() => undefined);
    const worker = new ShopMembershipCardAdjustmentExpiryWorker(
      { expireDue: jest.fn().mockResolvedValue({ scanned: 0, expired: 0, failed: 0 }) },
      { info: jest.fn(), error: jest.fn() },
      300_000,
      100
    );
    worker.start();
    worker.stop();
    worker.stop();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });
});
