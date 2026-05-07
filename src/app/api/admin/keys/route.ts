import { NextResponse } from "next/server";

import { ensureAdmin } from "@/server/admin/http";
import {
  clearProviderApiKey,
  getAllProviderKeyStatus,
  setProviderApiKey,
} from "@/server/admin/provider-keys";
import type { ProviderId } from "@/server/ocr/providers";

export const dynamic = "force-dynamic";

const PROVIDERS: ReadonlySet<ProviderId> = new Set(["openai", "anthropic", "google"]);

const isProvider = (value: unknown): value is ProviderId =>
  typeof value === "string" && PROVIDERS.has(value as ProviderId);

const badBody = (message: string) =>
  NextResponse.json({ error: "invalid_body", detail: message }, { status: 400 });

export async function GET() {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;
  return NextResponse.json({ providers: await getAllProviderKeyStatus() });
}

export async function PUT(req: Request) {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;

  const body = (await req.json().catch(() => ({}))) as { provider?: unknown; apiKey?: unknown };
  if (!isProvider(body.provider)) return badBody("provider must be openai|anthropic|google");
  if (typeof body.apiKey !== "string" || body.apiKey.trim().length === 0) {
    return badBody("apiKey must be a non-empty string");
  }
  if (/[\u0000-\u001f\u007f]/.test(body.apiKey)) {
    return badBody("apiKey contains control characters");
  }

  await setProviderApiKey(body.provider, body.apiKey);
  return NextResponse.json({ providers: await getAllProviderKeyStatus() });
}

export async function DELETE(req: Request) {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;

  const body = (await req.json().catch(() => ({}))) as { provider?: unknown };
  if (!isProvider(body.provider)) return badBody("provider must be openai|anthropic|google");

  await clearProviderApiKey(body.provider);
  return NextResponse.json({ providers: await getAllProviderKeyStatus() });
}
