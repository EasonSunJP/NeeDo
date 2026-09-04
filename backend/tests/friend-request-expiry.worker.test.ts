import { FriendRequestExpiryWorker } from "../src/workers/friend-request-expiry.worker";

describe("FriendRequestExpiryWorker", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("runs immediately, schedules one unref interval, and stops cleanly", async () => {
    const expireDue = jest.fn().mockResolvedValue({ expired: 2 });
    const logger = { info: jest.fn(), error: jest.fn() };
    const unref = jest.fn();
    const timer = { unref } as unknown as NodeJS.Timeout;
    const setIntervalSpy = jest.spyOn(global, "setInterval").mockReturnValue(timer);
    const clearIntervalSpy = jest
      .spyOn(global, "clearInterval")
      .mockImplementation(() => undefined);
    const worker = new FriendRequestExpiryWorker({ expireDue }, logger, 60_000, 100);

    worker.start();
    worker.start();
    await Promise.resolve();

    expect(expireDue).toHaveBeenCalledTimes(1);
    expect(expireDue).toHaveBeenCalledWith({ batchSize: 100 });
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
    expect(unref).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith({ expired: 2 }, "Friend request expiry completed");

    worker.stop();
    worker.stop();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
  });

  it("prevents overlapping batches", async () => {
    let release: ((value: { expired: number }) => void) | undefined;
    const expireDue = jest.fn().mockImplementation(
      () =>
        new Promise<{ expired: number }>((resolve) => {
          release = resolve;
        })
    );
    const logger = { info: jest.fn(), error: jest.fn() };
    const worker = new FriendRequestExpiryWorker({ expireDue }, logger, 60_000, 100);

    const firstRun = worker.runOnce();
    await worker.runOnce();

    expect(expireDue).toHaveBeenCalledTimes(1);
    release?.({ expired: 1 });
    await firstRun;
  });

  it("logs a failure and permits a later retry", async () => {
    const failure = new Error("database unavailable");
    const expireDue = jest
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ expired: 0 });
    const logger = { info: jest.fn(), error: jest.fn() };
    const worker = new FriendRequestExpiryWorker({ expireDue }, logger, 60_000, 100);

    await worker.runOnce();
    await worker.runOnce();

    expect(logger.error).toHaveBeenCalledWith({ error: failure }, "Friend request expiry failed");
    expect(expireDue).toHaveBeenCalledTimes(2);
  });
});
