import { env } from "@/lib/env";

export type LimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number; reason: string };

type Counter = { count: number; firstAt: number };
type RateLimitState = {
  ipScans: Map<string, Counter>;
  billRetries: Map<string, Counter>;
};

declare global {
  // eslint-disable-next-line no-var
  var __billyRateLimit: RateLimitState | undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const state = (): RateLimitState => {
  globalThis.__billyRateLimit ??= { ipScans: new Map(), billRetries: new Map() };
  return globalThis.__billyRateLimit;
};

const retryAfterSeconds = (firstAt: number, windowMs: number, now: number) =>
  Math.max(1, Math.ceil((firstAt + windowMs - now) / 1000));

const checkWindowed = (store: Map<string, Counter>, key: string, max: number, windowMs: number, now = Date.now()): LimitResult => {
  if (max <= 0) return { allowed: false, retryAfterSeconds: retryAfterSeconds(now, windowMs, now), reason: "limit disabled" };

  const current = store.get(key);
  if (!current || now - current.firstAt >= windowMs) {
    if (current) store.delete(key);
    return { allowed: true };
  }

  if (current.count >= max) {
    return {
      allowed: false,
      retryAfterSeconds: retryAfterSeconds(current.firstAt, windowMs, now),
      reason: "scan limit exceeded",
    };
  }

  return { allowed: true };
};

const consumeCounter = (store: Map<string, Counter>, key: string, windowMs?: number, now = Date.now()) => {
  const current = store.get(key);
  if (!current || (windowMs !== undefined && now - current.firstAt >= windowMs)) {
    store.set(key, { count: 1, firstAt: now });
    return;
  }
  current.count += 1;
};

export const ipScanLimit = {
  check(ip: string): LimitResult {
    return checkWindowed(state().ipScans, ip, env.BILLY_PER_IP_SCAN_LIMIT, DAY_MS);
  },
  consume(ip: string): void {
    consumeCounter(state().ipScans, ip, DAY_MS);
  },
  _reset(): void {
    state().ipScans.clear();
  },
};

export const billRetryLimit = {
  check(billId: string): LimitResult {
    const max = env.BILLY_PER_BILL_RETRY_LIMIT;
    if (max <= 0) return { allowed: false, retryAfterSeconds: 0, reason: "retry limit disabled" };
    const current = state().billRetries.get(billId);
    if (!current || current.count < max) return { allowed: true };
    return { allowed: false, retryAfterSeconds: 0, reason: "retry limit exceeded" };
  },
  consume(billId: string): void {
    consumeCounter(state().billRetries, billId);
  },
  _reset(): void {
    state().billRetries.clear();
  },
};
