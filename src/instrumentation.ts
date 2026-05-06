export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTtlCleanupScheduler } = await import("@/server/jobs/scheduler");
    startTtlCleanupScheduler();
  }
}
