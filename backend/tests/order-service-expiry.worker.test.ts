import { OrderServiceExpiryWorker } from "../src/workers/order-service-expiry.worker";

describe("OrderServiceExpiryWorker", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("starts immediately, schedules and unreferences the configured interval", async () => {
    const now = new Date("2026-09-01T10:00:00.000Z");
    const expireDueSessions = jest.fn(async () => 3);
    const logger = { info: jest.fn(), error: jest.fn() };
    const unref = jest.fn();
    const timer = { unref } as unknown as NodeJS.Timeout;
    const setIntervalSpy = jest.spyOn(global, "setInterval").mockReturnValue(timer);
    const worker = new OrderServiceExpiryWorker(
      { expireDueSessions },
      logger,
      60_000,
      100,
      () => now
    );

    worker.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(expireDueSessions).toHaveBeenCalledWith(now, 100);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
    expect(unref).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith({ advanced: 3 }, "Order service expiry completed");
  });

  it("suppresses overlap and permits a later run after failure", async () => {
    let finishFirst: ((value: number) => void) | undefined;
    const expireDueSessions = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            finishFirst = resolve;
          })
      )
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(0);
    const logger = { info: jest.fn(), error: jest.fn() };
    const worker = new OrderServiceExpiryWorker({ expireDueSessions }, logger, 60_000, 100);

    const first = worker.runOnce();
    await worker.runOnce();
    expect(expireDueSessions).toHaveBeenCalledTimes(1);
    finishFirst?.(1);
    await first;
    await worker.runOnce();
    await worker.runOnce();

    expect(expireDueSessions).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(
      { error: expect.any(Error) },
      "Order service expiry failed"
    );
  });

  it("starts and stops idempotently", () => {
    const timer = { unref: jest.fn() } as unknown as NodeJS.Timeout;
    const setIntervalSpy = jest.spyOn(global, "setInterval").mockReturnValue(timer);
    const clearIntervalSpy = jest
      .spyOn(global, "clearInterval")
      .mockImplementation(() => undefined);
    const worker = new OrderServiceExpiryWorker(
      { expireDueSessions: jest.fn(async () => 0) },
      { info: jest.fn(), error: jest.fn() },
      60_000,
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
