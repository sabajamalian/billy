import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_COOKIE_NAME } from "@/server/admin/auth";
import { ensureAdmin } from "@/server/admin/http";

export const dynamic = "force-dynamic";

export async function POST() {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;

  const store = await cookies();
  store.delete(ADMIN_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
