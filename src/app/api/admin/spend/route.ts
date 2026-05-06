import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { ensureAdmin } from "@/server/admin/http";

export const dynamic = "force-dynamic";

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

export async function GET() {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - 29);

  const runs = await prisma.ocrRun.findMany({
    where: { createdAt: { gte: start }, costUsd: { not: null } },
    select: { createdAt: true, costUsd: true },
  });

  const spendByDate = new Map<string, number>();
  for (const run of runs) {
    const key = dateKey(run.createdAt);
    spendByDate.set(key, (spendByDate.get(key) ?? 0) + (run.costUsd ?? 0));
  }

  const last30Days = Array.from({ length: 30 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    const date = dateKey(day);
    return { date, spentUsd: spendByDate.get(date) ?? 0 };
  });

  const todayDate = dateKey(new Date());
  return NextResponse.json({
    today: { spentUsd: spendByDate.get(todayDate) ?? 0, capUsd: env.BILLY_DAILY_LLM_COST_USD },
    last30Days,
  });
}
