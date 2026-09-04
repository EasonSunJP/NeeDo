import { BookingUserRewardExpiryWorker } from "../src/workers/booking-user-reward-expiry.worker";

describe("BookingUserRewardExpiryWorker", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("starts immediately, schedules the configured interval, and logs a summary", async () => {
    const expireDue = jest.fn().mockResolvedValue({ scanned: 4, expired: 3, failed: 1 });
    const logger = { info: jest.fn(), error: jest.fn() };
    const unref = jest.fn();
    const timer = { unref } as unknown as NodeJS.Timeout;
    const setIntervalSpy = jest.spyOn(global, "setInterval").mockReturnValue(timer);
    const worker = new BookingUserRewardExpiryWorker(
      { expireDue },
      logger,
      300_000,
      100,
      () => new Date("2026-09-05T00:00:00.000Z")
    );

    worker.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 300_000);
    expect(unref).toHaveBeenCalledTimes(1);
    expect(expireDue).toHaveBeenCalledWith({
      now: new Date("2026-09-05T00:00:00.000Z"),
      batchSize: 100
    });
    expect(logger.info).toHaveBeenCalledWith(
      { scanned: 4, expired: 3, failed: 1 },
      "Booking user reward expiry completed"
    );
  });

  it("does not overlap runs and permits retry after failure", async () => {
    let resolveRun:
      | ((value: { scanned: number; expired: number; failed: number }) => void)
      | undefined;
    const expireDue = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ scanned: number; expired: number; failed: number }>((resolve) => {
            resolveRun = resolve;
          })
      )
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce({ scanned: 0, expired: 0, failed: 0 });
    const logger = { info: jest.fn(), error: jest.fn() };
    const worker = new BookingUserRewardExpiryWorker({ expireDue }, logger, 300_000, 100);

    const first = worker.runOnce();
    await worker.runOnce();
    expect(expireDue).toHaveBeenCalledTimes(1);
    resolveRun?.({ scanned: 1, expired: 1, failed: 0 });
    await first;
    await worker.runOnce();
    await worker.runOnce();

    expect(expireDue).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(
      { error: expect.any(Error) },
      "Booking user reward expiry failed"
    );
  });

  it("stops its interval idempotently", () => {
    const logger = { info: jest.fn(), error: jest.fn() };
    const timer = { unref: jest.fn() } as unknown as NodeJS.Timeout;
    jest.spyOn(global, "setInterval").mockReturnValue(timer);
    const clearIntervalSpy = jest
      .spyOn(global, "clearInterval")
      .mockImplementation(() => undefined);
    const worker = new BookingUserRewardExpiryWorker(
      { expireDue: jest.fn().mockResolvedValue({ scanned: 0, expired: 0, failed: 0 }) },
      logger,
      300_000,
      100
    );

    worker.start();
    worker.stop();
    worker.stop();

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
  });
});
