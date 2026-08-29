import { env } from "../src/config/env";
import { ExchangePostExpiryWorker } from "../src/workers/exchange-post-expiry.worker";

describe("ExchangePostExpiryWorker", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses safe defaults, starts immediately, and schedules the configured interval", async () => {
    expect(env.EXCHANGE_EXPIRY_WORKER_ENABLED).toBe(true);
    expect(env.EXCHANGE_EXPIRY_INTERVAL_MS).toBe(300_000);
    expect(env.EXCHANGE_EXPIRY_BATCH_SIZE).toBe(100);

    const expireDue = jest.fn(async () => 17);
    const logger = { info: jest.fn(), error: jest.fn() };
    const unref = jest.fn();
    const timer = { unref } as unknown as NodeJS.Timeout;
    const setIntervalSpy = jest.spyOn(global, "setInterval").mockReturnValue(timer);
    const worker = new ExchangePostExpiryWorker(
      { expireDue },
      logger,
      300_000,
      100,
      () => new Date("2026-08-30T03:00:00.000Z")
    );

    worker.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(expireDue).toHaveBeenCalledWith(new Date("2026-08-30T03:00:00.000Z"), 100);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 300_000);
    expect(unref).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith({ expired: 17 }, "Exchange post expiry completed");
  });

  it("does not overlap and recovers after a failed tick", async () => {
    let resolveRun: ((value: number) => void) | undefined;
    const expireDue = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            resolveRun = resolve;
          })
      )
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(0);
    const logger = { info: jest.fn(), error: jest.fn() };
    const worker = new ExchangePostExpiryWorker({ expireDue }, logger, 300_000, 100);

    const first = worker.runOnce();
    await worker.runOnce();
    expect(expireDue).toHaveBeenCalledTimes(1);
    resolveRun?.(1);
    await first;
    await worker.runOnce();
    await worker.runOnce();

    expect(expireDue).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(
      { error: expect.any(Error) },
      "Exchange post expiry failed"
    );
  });

  it("starts and stops idempotently", () => {
    const logger = { info: jest.fn(), error: jest.fn() };
    const timer = { unref: jest.fn() } as unknown as NodeJS.Timeout;
    const setIntervalSpy = jest.spyOn(global, "setInterval").mockReturnValue(timer);
    const clearIntervalSpy = jest
      .spyOn(global, "clearInterval")
      .mockImplementation(() => undefined);
    const worker = new ExchangePostExpiryWorker(
      { expireDue: jest.fn(async () => 0) },
      logger,
      300_000,
      100
    );

    worker.start();
    worker.start();
    worker.stop();
    worker.stop();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
  });
});
