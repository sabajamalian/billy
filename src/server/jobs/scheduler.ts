import { runTtlCleanup } from "./ttl-cleanup";

export type SchedulerHandle = {
  stop(): void;
};

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

const globalForScheduler = globalThis as {
  __ttlScheduler?: { interval: NodeJS.Timeout | null; stop: () => void };
};

const runSafely = async () => {
  try {
    await runTtlCleanup();
  } catch (error) {
    console.warn(
      "[ttl-cleanup]",
      JSON.stringify({
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: String(error) },
      }),
    );
  }
};

// Schedule ttl-cleanup to run every `intervalMs` (default 1 hour).
// Idempotent across hot reload: a new start stops any previous scheduler first.
export function startTtlCleanupScheduler(opts?: { intervalMs?: number }): SchedulerHandle {
  globalForScheduler.__ttlScheduler?.stop();

  const interval = setInterval(() => {
    void runSafely();
  }, opts?.intervalMs ?? DEFAULT_INTERVAL_MS);

  const scheduler: { interval: NodeJS.Timeout | null; stop: () => void } = {
    interval,
    stop: () => {
      if (scheduler.interval) {
        clearInterval(scheduler.interval);
        scheduler.interval = null;
      }
      if (globalForScheduler.__ttlScheduler === scheduler) {
        delete globalForScheduler.__ttlScheduler;
      }
    },
  };

  globalForScheduler.__ttlScheduler = scheduler;
  void runSafely();

  return scheduler;
}
