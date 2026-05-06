import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { ensureAdmin } from "@/server/admin/http";

export const dynamic = "force-dynamic";

const clamp = (value: string | null, fallback: number, max: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

export async function GET(req: Request) {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const limit = clamp(url.searchParams.get("limit"), 50, 100);
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const runs = await prisma.ocrRun.findMany({
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: limit,
    select: {
      id: true,
      billId: true,
      provider: true,
      model: true,
      ok: true,
      latencyMs: true,
      costUsd: true,
      error: true,
      imageHash: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ runs });
}
