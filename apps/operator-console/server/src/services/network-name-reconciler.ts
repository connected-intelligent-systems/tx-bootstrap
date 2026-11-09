type Logger = {
  info: (data: unknown, message?: string) => void;
  error: (error: unknown, message: string) => void;
};

/**
 * Periodically enforces operator-assigned tunnel hostnames in Headscale.
 * A failed run is logged and retried on the next interval.
 */
export function createNetworkNameReconciler({
  reconcile,
  logger,
  intervalMs = 15_000,
}: {
  reconcile: () => Promise<{ renamed: number }>;
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
      const { renamed } = await reconcile();
      if (renamed > 0) logger.info({ renamed }, "Reconciled tunnel node names");
    } catch (error) {
      logger.error(error, "Tunnel node name reconciliation failed");
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
