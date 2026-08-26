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

    expect(stopWorker).toHaveBeenCalledTimes(1);
    expect(closeServer).toHaveBeenCalledTimes(1);

    closeCallback?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
