import { beforeEach, describe, expect, it, vi } from "vitest";

const loadBudget = async (cap = 1) => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "file:./data/test.db");
  vi.stubEnv("BILLY_DAILY_LLM_COST_USD", String(cap));
  const mod = await import("@/server/limits/budget");
  mod.llmBudget._reset();
  return mod.llmBudget;
};

describe("llmBudget", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    delete globalThis.__billyBudget;
  });

  it("allows an empty budget", async () => {
    const llmBudget = await loadBudget(1);

    expect(llmBudget.check()).toEqual({ allowed: true, spentToday: 0, capUsd: 1 });
  });

  it("records spend and adds it up", async () => {
    const llmBudget = await loadBudget(1);

    llmBudget.record(0.1);
    llmBudget.record(0.25);

    expect(llmBudget.spentToday()).toBeCloseTo(0.35);
    expect(llmBudget.check()).toMatchObject({ allowed: true, capUsd: 1 });
  });

  it("resets spend on UTC day rollover", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-05-06T23:59:59Z").getTime());
    const llmBudget = await loadBudget(1);

    llmBudget.record(0.75);
    expect(llmBudget.spentToday()).toBeCloseTo(0.75);

    vi.mocked(Date.now).mockReturnValue(new Date("2026-05-07T00:00:00Z").getTime());
    expect(llmBudget.spentToday()).toBe(0);
    expect(llmBudget.check()).toEqual({ allowed: true, spentToday: 0, capUsd: 1 });
  });

  it("blocks once spend reaches the cap", async () => {
    const llmBudget = await loadBudget(0.5);

    llmBudget.record(0.5);

    expect(llmBudget.check()).toMatchObject({ allowed: false, spentToday: 0.5, capUsd: 0.5 });
  });
});
