type Logger = {
  info: (message: string) => void;
  error: (error: unknown, message: string) => void;
};

type ShutdownOptions = {
  logger: Logger;
  serviceName: string;
  cleanup: () => Promise<void>;
};

export function setupGracefulShutdown(options: ShutdownOptions): void {
  const { logger, serviceName, cleanup } = options;
  let isShuttingDown = false;

  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received shutdown signal, closing ${serviceName}...`);

    try {
      await cleanup();
      logger.info(`${serviceName} closed successfully`);
      process.exit(0);
    } catch (err) {
      logger.error(err, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
