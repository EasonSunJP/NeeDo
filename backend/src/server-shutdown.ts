type ShutdownLogger = {
  error: (context: Record<string, unknown>, message: string) => void;
  info: ((context: Record<string, unknown>, message: string) => void) &
    ((message: string) => void);
};

type ShutdownDependencies = {
  closeServer: (callback: (error?: Error) => void) => void;
  disconnect: () => Promise<void>;
  exit: (code: number) => void;
  logger: ShutdownLogger;
  stopWorker: () => void;
};

export const createShutdownHandler = ({
  closeServer,
  disconnect,
  exit,
  logger,
  stopWorker
}: ShutdownDependencies) => {
  let shuttingDown = false;

  return (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    stopWorker();
    logger.info({ signal }, "NeeDo backend shutdown requested");
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
  };
};
