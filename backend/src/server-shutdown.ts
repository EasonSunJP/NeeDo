type ShutdownLogger = {
  error: (context: Record<string, unknown>, message: string) => void;
  info: ((context: Record<string, unknown>, message: string) => void) & ((message: string) => void);
};

type ShutdownDependencies = {
  closeServer: (callback: (error?: Error) => void) => void;
  disconnect: () => Promise<void>;
  exit: (code: number) => void;
  logger: ShutdownLogger;
  stopWorker: () => void | Promise<void>;
  forceStopWorker?: () => void;
  workerStopTimeoutMs?: number;
};

export const createShutdownHandler = ({
  closeServer,
  disconnect,
  exit,
  forceStopWorker,
  logger,
  stopWorker,
  workerStopTimeoutMs
}: ShutdownDependencies) => {
  let shuttingDown = false;

  const stopWorkersWithinDeadline = async (): Promise<void> => {
    if (!forceStopWorker || workerStopTimeoutMs === undefined) {
      await stopWorker();
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(
        () => {
          logger.error({ workerStopTimeoutMs }, "NeeDo backend worker shutdown deadline exceeded");
          try {
            forceStopWorker();
          } catch (error) {
            logger.error({ error }, "NeeDo backend worker force shutdown failed");
          }
          finish();
        },
        Math.max(1, Math.floor(workerStopTimeoutMs))
      );
      timeout.unref();
      void Promise.resolve()
        .then(stopWorker)
        .then(finish)
        .catch((error) => {
          logger.error({ error }, "NeeDo backend worker shutdown failed");
          finish();
        });
    });
  };

  return (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info({ signal }, "NeeDo backend shutdown requested");
    void Promise.resolve()
      .then(stopWorkersWithinDeadline)
      .catch((error) => {
        logger.error({ error }, "NeeDo backend worker shutdown failed");
      })
      .then(() => {
        closeServer((error) => {
          if (error) {
            logger.error({ error }, "NeeDo backend shutdown failed");
            exit(1);
            return;
          }

          disconnect()
            .then(() => {
              logger.info("NeeDo backend stopped");
              exit(0);
            })
            .catch((disconnectError) => {
              logger.error({ error: disconnectError }, "NeeDo backend dependency shutdown failed");
              exit(1);
            });
        });
      });
  };
};
