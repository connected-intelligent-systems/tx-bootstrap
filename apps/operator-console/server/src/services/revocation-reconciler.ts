type Logger = {
  info: (data: unknown, message?: string) => void;
  error: (error: unknown, message: string) => void;
};

/**
 * Periodically repeats the steps of unfinished revocations: credentials the
 * issuer produced after the holder was blocked, failed steps and tunnel
 * cleanup. A failed run is logged and retried on the next interval.
 */
export function createRevocationReconciler({
  reconcile,
  logger,
  intervalMs = 30_000,
}: {
  reconcile: () => Promise<{ completed: number; incomplete: number }>;
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
      const { completed, incomplete } = await reconcile();
      if (completed > 0) logger.info({ completed }, "Completed revocations");
      if (incomplete > 0)
        logger.info({ incomplete }, "Revocations still in progress");
    } catch (error) {
      logger.error(error, "Revocation reconciliation failed");
    }
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      schedule(intervalMs);
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await activeRun;
    },
    runOnce,
  };
}
