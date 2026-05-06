import crypto from "node:crypto";
import { cookies } from "next/headers";

import { env } from "@/lib/env";

export const ADMIN_COOKIE_NAME = "billy_admin";

type Counter = { count: number; firstAt: number };
type AdminAttemptState = { attempts: Map<string, Counter> };

declare global {
  var __billyAdminAttempts: AdminAttemptState | undefined;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const state = (): AdminAttemptState => {
  globalThis.__billyAdminAttempts ??= { attempts: new Map() };
  return globalThis.__billyAdminAttempts;
};

const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

const hmac = (expiresAt: string): string => {
  if (!env.ADMIN_PASSWORD) throw new Error("Admin is disabled");
  return crypto.createHmac("sha256", env.ADMIN_PASSWORD).update(`billy-admin:${expiresAt}`).digest("hex");
};

export function signAdminCookie(now: Date): string {
  const expiresAt = new Date(now.getTime() + TTL_MS).toISOString();
  return `${hmac(expiresAt)}.${expiresAt}`;
}

export function verifyAdminCookie(value: string): boolean {
  if (!env.ADMIN_PASSWORD) return false;
  const separator = value.indexOf(".");
  if (separator <= 0) return false;

  const signature = value.slice(0, separator);
  const expiresAt = value.slice(separator + 1);
  const expires = new Date(expiresAt);
  if (!Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now()) return false;

  const expected = hmac(expiresAt);
  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function requireAdmin(): Promise<void> {
  const store = await cookies();
  const value = store.get(ADMIN_COOKIE_NAME)?.value;
  if (!value || !verifyAdminCookie(value)) {
    throw unauthorized();
  }
}

const retryAfterSeconds = (firstAt: number, now: number) =>
  Math.max(1, Math.ceil((firstAt + ATTEMPT_WINDOW_MS - now) / 1000));

export const adminLoginRateLimit = {
  check(ip: string, now = Date.now()): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const attempts = state().attempts;
    const current = attempts.get(ip);
    if (!current || now - current.firstAt >= ATTEMPT_WINDOW_MS) {
      if (current) attempts.delete(ip);
      return { allowed: true };
    }
    if (current.count >= MAX_ATTEMPTS) {
      return { allowed: false, retryAfterSeconds: retryAfterSeconds(current.firstAt, now) };
    }
    return { allowed: true };
  },
  consume(ip: string, now = Date.now()): void {
    const attempts = state().attempts;
    const current = attempts.get(ip);
    if (!current || now - current.firstAt >= ATTEMPT_WINDOW_MS) {
      attempts.set(ip, { count: 1, firstAt: now });
      return;
    }
    current.count += 1;
  },
  reset(ip?: string): void {
    if (ip) state().attempts.delete(ip);
    else state().attempts.clear();
  },
};
