import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { ADMIN_COOKIE_NAME, adminLoginRateLimit, signAdminCookie } from "@/server/admin/auth";

export const dynamic = "force-dynamic";

const clientIp = (request: NextRequest) => request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

const safeEqual = (a: string, b: string): boolean => {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
};

export async function POST(req: NextRequest) {
  if (!env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "admin_disabled" }, { status: 404 });
  }

  const ip = clientIp(req);
  const limit = adminLoginRateLimit.check(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  if (!safeEqual(password, env.ADMIN_PASSWORD)) {
    adminLoginRateLimit.consume(ip);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  adminLoginRateLimit.reset(ip);
  const token = signAdminCookie(new Date());
  const store = await cookies();
  store.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 24 * 60 * 60,
  });

  return NextResponse.json({ ok: true });
}
