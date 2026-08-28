import { ContentPublicationWorker } from "../src/workers/content-publication.worker";

describe("ContentPublicationWorker", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("starts one immediate run and one unref interval", async () => {
    const activateDue = jest.fn().mockResolvedValue({ scanned: 3, activated: 2, failed: 1 });
    const logger = { info: jest.fn(), error: jest.fn() };
    const unref = jest.fn();
    const timer = { unref } as unknown as NodeJS.Timeout;
    const interval = jest.spyOn(global, "setInterval").mockReturnValue(timer);
    const now = new Date("2026-08-29T09:00:00.000Z");
    const worker = new ContentPublicationWorker({ activateDue }, logger, 60_000, 50, () => now);

    worker.start();
    worker.start();
    await Promise.resolve();

    expect(activateDue).toHaveBeenCalledTimes(1);
    expect(activateDue).toHaveBeenCalledWith({ now, batchSize: 50 });
    expect(interval).toHaveBeenCalledTimes(1);
    expect(interval).toHaveBeenCalledWith(expect.any(Function), 60_000);
    expect(unref).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      { scanned: 3, activated: 2, failed: 1 },
      "Content publication activation completed"
    );
  });

  it("prevents overlapping executions", async () => {
    let resolveRun:
      | ((result: { scanned: number; activated: number; failed: number }) => void)
      | undefined;
    const activateDue = jest.fn(
      () =>
        new Promise<{ scanned: number; activated: number; failed: number }>((resolve) => {
          resolveRun = resolve;
        })
    );
    const worker = new ContentPublicationWorker(
      { activateDue },
      { info: jest.fn(), error: jest.fn() },
      60_000,
      50
    );

    const first = worker.runOnce();
    await worker.runOnce();

    expect(activateDue).toHaveBeenCalledTimes(1);
    resolveRun?.({ scanned: 1, activated: 1, failed: 0 });
    await first;
  });

  it("logs a failed run and permits recovery on the next run", async () => {
    const failure = new Error("database unavailable");
    const activateDue = jest
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ scanned: 0, activated: 0, failed: 0 });
    const logger = { info: jest.fn(), error: jest.fn() };
    const worker = new ContentPublicationWorker({ activateDue }, logger, 60_000, 50);

    await worker.runOnce();
    await worker.runOnce();

    expect(activateDue).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      { error: failure },
      "Content publication activation failed"
    );
  });

  it("clears its interval once across repeated stops", () => {
    const unref = jest.fn();
    const timer = { unref } as unknown as NodeJS.Timeout;
    jest.spyOn(global, "setInterval").mockReturnValue(timer);
    const clear = jest.spyOn(global, "clearInterval").mockImplementation(() => undefined);
    const worker = new ContentPublicationWorker(
      { activateDue: jest.fn().mockResolvedValue({ scanned: 0, activated: 0, failed: 0 }) },
      { info: jest.fn(), error: jest.fn() },
      60_000,
      50
    );

    worker.start();
    worker.stop();
    worker.stop();

    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith(timer);
  });
});
