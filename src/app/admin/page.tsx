import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { env, isAdminEnabled } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { ADMIN_COOKIE_NAME, verifyAdminCookie } from "@/server/admin/auth";
import { getAllProviderKeyStatus } from "@/server/admin/provider-keys";
import { getActiveModels, getQuorumOverride } from "@/server/admin/settings";
import { PRICING_PER_MTOKEN_USD } from "@/server/ocr/providers";

export const dynamic = "force-dynamic";

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

async function getSpend() {
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
  return {
    today: { spentUsd: spendByDate.get(dateKey(new Date())) ?? 0, capUsd: env.BILLY_DAILY_LLM_COST_USD },
    last30Days,
  };
}

export default async function AdminPage() {
  if (!isAdminEnabled()) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Admin disabled</CardTitle>
            <CardDescription>The Billy admin panel is not enabled for this deployment.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Set <code className="rounded bg-muted px-1 py-0.5">ADMIN_PASSWORD</code> to enable it.
          </CardContent>
        </Card>
      </main>
    );
  }

  const store = await cookies();
  if (!verifyAdminCookie(store.get(ADMIN_COOKIE_NAME)?.value ?? "")) redirect("/admin/login");

  const [activeModels, quorumOverride, spend, runs, providerKeyStatus] = await Promise.all([
    getActiveModels(),
    getQuorumOverride(),
    getSpend(),
    prisma.ocrRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
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
    }),
    getAllProviderKeyStatus(),
  ]);

  const providerKeysPresent = {
    openai: providerKeyStatus.openai.source === "db" || providerKeyStatus.openai.source === "env",
    anthropic: providerKeyStatus.anthropic.source === "db" || providerKeyStatus.anthropic.source === "env",
    google: providerKeyStatus.google.source === "db" || providerKeyStatus.google.source === "env",
  };

  return (
    <AdminDashboard
      settings={{
        activeModels,
        availableModels: Object.keys(PRICING_PER_MTOKEN_USD),
        quorumOverride,
        providerKeysPresent,
        providerKeyStatus,
      }}
      spend={spend}
      runs={runs.map((run) => ({ ...run, createdAt: run.createdAt.toISOString() }))}
    />
  );
}
