import { AffiliateTaskExpiryWorker } from "../src/workers/affiliate-task-expiry.worker";

describe("AffiliateTaskExpiryWorker", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("starts one immediate run and one unref'd interval", async () => {
    const expireDue = jest.fn().mockResolvedValue({
      scanned: 4,
      ended: 3,
      released: 2,
      failed: 0,
      releasedNdp: 80
    });
    const logger = { info: jest.fn(), error: jest.fn() };
    const unref = jest.fn();
    const timer = { unref } as unknown as NodeJS.Timeout;
    const setIntervalSpy = jest.spyOn(global, "setInterval").mockReturnValue(timer);
    const now = new Date("2026-08-26T05:00:00.000Z");
    const worker = new AffiliateTaskExpiryWorker(
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
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 300_000);
    expect(unref).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      { scanned: 4, ended: 3, released: 2, failed: 0, releasedNdp: 80 },
      "Affiliate task expiry completed"
    );
  });

  it("does not overlap expiry batches", async () => {
    let resolveRun:
      | ((value: {
          scanned: number;
          ended: number;
          released: number;
          failed: number;
          releasedNdp: number;
        }) => void)
      | undefined;
    const expireDue = jest.fn().mockImplementation(
      () =>
        new Promise<{
          scanned: number;
          ended: number;
          released: number;
          failed: number;
          releasedNdp: number;
        }>((resolve) => {
          resolveRun = resolve;
        })
    );
    const logger = { info: jest.fn(), error: jest.fn() };
    const worker = new AffiliateTaskExpiryWorker({ expireDue }, logger, 300_000, 100);

    const firstRun = worker.runOnce();
    await worker.runOnce();

    expect(expireDue).toHaveBeenCalledTimes(1);
    resolveRun?.({ scanned: 1, ended: 1, released: 1, failed: 0, releasedNdp: 20 });
    await firstRun;
  });

  it("logs a top-level failure and permits a later retry", async () => {
    const failure = new Error("database unavailable");
    const expireDue = jest
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ scanned: 0, ended: 0, released: 0, failed: 0, releasedNdp: 0 });
    const logger = { info: jest.fn(), error: jest.fn() };
    const worker = new AffiliateTaskExpiryWorker({ expireDue }, logger, 300_000, 100);

    await worker.runOnce();
    await worker.runOnce();

    expect(logger.error).toHaveBeenCalledWith(
      { error: failure },
      "Affiliate task expiry failed"
    );
    expect(expireDue).toHaveBeenCalledTimes(2);
  });

  it("stops its interval once and can be stopped repeatedly", () => {
    const expireDue = jest.fn().mockResolvedValue({
      scanned: 0,
      ended: 0,
      released: 0,
      failed: 0,
      releasedNdp: 0
    });
    const logger = { info: jest.fn(), error: jest.fn() };
    const unref = jest.fn();
    const timer = { unref } as unknown as NodeJS.Timeout;
    jest.spyOn(global, "setInterval").mockReturnValue(timer);
    const clearIntervalSpy = jest.spyOn(global, "clearInterval").mockImplementation(() => undefined);
    const worker = new AffiliateTaskExpiryWorker({ expireDue }, logger, 300_000, 100);

    worker.start();
    worker.stop();
    worker.stop();

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
  });
});
