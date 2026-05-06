import { env } from "@/lib/env";

export type BudgetCheckResult =
  | { allowed: true; spentToday: number; capUsd: number }
  | { allowed: false; spentToday: number; capUsd: number; reason: string };

type BudgetState = { ledger: Map<string, number> };

declare global {
  // eslint-disable-next-line no-var
  var __billyBudget: BudgetState | undefined;
}

const state = (): BudgetState => {
  globalThis.__billyBudget ??= { ledger: new Map() };
  return globalThis.__billyBudget;
};

const todayKey = () => new Date(Date.now()).toISOString().slice(0, 10);

export const llmBudget = {
  check(): BudgetCheckResult {
    const spentToday = this.spentToday();
    const capUsd = env.BILLY_DAILY_LLM_COST_USD;
    if (capUsd <= 0 || spentToday < capUsd) return { allowed: true, spentToday, capUsd };
    return { allowed: false, spentToday, capUsd, reason: "daily LLM budget exceeded" };
  },
  record(costUsd: number): void {
    if (!Number.isFinite(costUsd) || costUsd <= 0) return;
    const key = todayKey();
    state().ledger.set(key, (state().ledger.get(key) ?? 0) + costUsd);
  },
  spentToday(): number {
    return state().ledger.get(todayKey()) ?? 0;
  },
  _reset(): void {
    state().ledger.clear();
  },
};
