type Logger = {
  info: (data: unknown, message?: string) => void;
  error: (error: unknown, message: string) => void;
};

/**
 * Periodically reconciles Headscale with the console: revokes enrollments of
 * rejected participants, retries unfinished revocations and enforces
 * operator-assigned tunnel hostnames. A failed run is logged and retried on
 * the next interval.
 */
export function createNetworkNameReconciler({
  reconcile,
  logger,
  intervalMs = 15_000,
}: {
  reconcile: () => Promise<{
    renamed: number;
    revoked?: number;
    failed?: number;
  }>;
  logger: Logger;
  intervalMs?: number;
}) {
  let stopped = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeRun: Promise<void> = Promise.resolve();

  function schedule(delayMs: number) {
    if (stopped) return;
    timer = setTimeout(() => {
      activeRun = runOnce().finally(() => schedule(intervalMs));
    }, delayMs);
  }

  async function runOnce() {
    try {
      const { renamed, revoked = 0, failed = 0 } = await reconcile();
      if (renamed > 0) logger.info({ renamed }, "Reconciled tunnel node names");
      if (revoked > 0) logger.info({ revoked }, "Revoked tunnel enrollments");
      if (failed > 0)
        logger.error(
          { failed },
          "Tunnel enrollment revocation failed; retrying next run",
        );
    } catch (error) {
      logger.error(error, "Tunnel network reconciliation failed");
    }
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      schedule(0);
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await activeRun;
    },
    runOnce,
  };
}
