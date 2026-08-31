import { createShutdownHandler } from "../src/server-shutdown";

describe("backend shutdown", () => {
  it("closes dependencies only once when multiple termination signals arrive", async () => {
    let closeCallback: ((error?: Error) => void) | undefined;
    const stopWorker = jest.fn();
    const closeServer = jest.fn((callback: (error?: Error) => void) => {
      closeCallback = callback;
    });
    const disconnect = jest.fn(async () => undefined);
    const exit = jest.fn();
    const logger = {
      error: jest.fn(),
      info: jest.fn()
    };
    const shutdown = createShutdownHandler({
      closeServer,
      disconnect,
      exit,
      logger,
      stopWorker
    });

    shutdown("SIGINT");
    shutdown("SIGTERM");

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(stopWorker).toHaveBeenCalledTimes(1);
    expect(closeServer).toHaveBeenCalledTimes(1);

    closeCallback?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("waits for the bounded worker stop before closing shared dependencies", async () => {
    let finishWorker: (() => void) | undefined;
    const stopWorker = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishWorker = resolve;
        })
    );
    const closeServer = jest.fn();
    const shutdown = createShutdownHandler({
      closeServer,
      disconnect: jest.fn(async () => undefined),
      exit: jest.fn(),
      logger: { error: jest.fn(), info: jest.fn() },
      stopWorker
    });

    shutdown("SIGTERM");
    await Promise.resolve();
    expect(closeServer).not.toHaveBeenCalled();
    finishWorker?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(closeServer).toHaveBeenCalledTimes(1);
  });

  it("forces the worker runtime closed and continues shutdown when graceful stop never settles", async () => {
    jest.useFakeTimers();
    const stopWorker = jest.fn(() => new Promise<void>(() => undefined));
    const forceStopWorker = jest.fn();
    const closeServer = jest.fn();
    const Shutdown = createShutdownHandler as unknown as (input: {
      closeServer: typeof closeServer;
      disconnect: jest.Mock;
      exit: jest.Mock;
      logger: { error: jest.Mock; info: jest.Mock };
      stopWorker: typeof stopWorker;
      forceStopWorker: typeof forceStopWorker;
      workerStopTimeoutMs: number;
    }) => (signal: NodeJS.Signals) => void;
    const shutdown = Shutdown({
      closeServer,
      disconnect: jest.fn(async () => undefined),
      exit: jest.fn(),
      logger: { error: jest.fn(), info: jest.fn() },
      stopWorker,
      forceStopWorker,
      workerStopTimeoutMs: 50
    });

    shutdown("SIGTERM");
    await jest.advanceTimersByTimeAsync(50);
    expect(forceStopWorker).toHaveBeenCalledTimes(1);
    expect(closeServer).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
