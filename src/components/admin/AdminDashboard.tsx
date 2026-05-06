"use client";

import { useMemo, useState } from "react";
import type React from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCents } from "@/lib/utils";
import type { ConfiguredModel } from "@/server/ocr/providers";

type ProviderKeysPresent = { openai: boolean; anthropic: boolean; google: boolean };
type SettingsData = {
  activeModels: ConfiguredModel[];
  availableModels: string[];
  quorumOverride: number | null;
  providerKeysPresent: ProviderKeysPresent;
};
type SpendData = {
  today: { spentUsd: number; capUsd: number };
  last30Days: Array<{ date: string; spentUsd: number }>;
};
type OcrRunRow = {
  id: string;
  billId: string;
  provider: string;
  model: string;
  ok: boolean;
  latencyMs: number;
  costUsd: number | null;
  error: string | null;
  imageHash: string;
  createdAt: string;
};

export type AdminDashboardProps = {
  settings: SettingsData;
  spend: SpendData;
  runs: OcrRunRow[];
};

const modelKey = (model: ConfiguredModel) => `${model.provider}:${model.model}`;
const usd = (value: number | null | undefined) => formatCents(Math.round((value ?? 0) * 100));

export function AdminDashboard({ settings, spend, runs }: AdminDashboardProps) {
  const router = useRouter();
  const [activeModels, setActiveModels] = useState(() => new Set(settings.activeModels.map(modelKey)));
  const [quorum, setQuorum] = useState(settings.quorumOverride?.toString() ?? "");
  const [savingModels, setSavingModels] = useState(false);
  const [savingQuorum, setSavingQuorum] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const visibleRuns = useMemo(() => runs.slice(page * 50, page * 50 + 50), [runs, page]);

  async function patchSettings(body: unknown) {
    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("Save failed");
    setMessage("Saved.");
    router.refresh();
  }

  async function saveModels() {
    setSavingModels(true);
    setMessage(null);
    const models = [...activeModels].map((entry) => {
      const separator = entry.indexOf(":");
      return { provider: entry.slice(0, separator), model: entry.slice(separator + 1) };
    });
    await patchSettings({ activeModels: models }).finally(() => setSavingModels(false));
  }

  async function saveQuorum() {
    setSavingQuorum(true);
    setMessage(null);
    const value = quorum.trim() === "" ? null : Number.parseInt(quorum, 10);
    await patchSettings({ quorumOverride: value }).finally(() => setSavingQuorum(false));
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <main className="min-h-svh bg-muted/30 p-3 sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Billy Admin</h1>
            <p className="text-sm text-muted-foreground">Runtime OCR settings and spend visibility.</p>
          </div>
          <Button variant="outline" onClick={logout}>Logout</Button>
        </header>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

        <Tabs defaultValue="models">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="models">Models</TabsTrigger>
            <TabsTrigger value="spend">Spend</TabsTrigger>
            <TabsTrigger value="runs">OCR Runs</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="models">
            <Card>
              <CardHeader>
                <CardTitle>Active OCR models</CardTitle>
                <CardDescription>Select provider:model pairs used for receipt scans.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(settings.providerKeysPresent).map(([provider, present]) => (
                    <Badge key={provider} variant={present ? "secondary" : "outline"}>
                      {present ? "✓" : "✗"}{provider}
                    </Badge>
                  ))}
                </div>
                <div className="divide-y rounded-lg border">
                  {settings.availableModels.map((entry) => (
                    <label key={entry} className="flex cursor-pointer items-center gap-3 p-3">
                      <input
                        type="checkbox"
                        checked={activeModels.has(entry)}
                        onChange={(event) => {
                          setActiveModels((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(entry);
                            else next.delete(entry);
                            return next;
                          });
                        }}
                      />
                      <span className="font-mono text-xs sm:text-sm">{entry}</span>
                    </label>
                  ))}
                </div>
                <Button onClick={saveModels} disabled={savingModels}>
                  {savingModels ? "Saving…" : "Save models"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="spend">
            <Card>
              <CardHeader>
                <CardTitle>Spend</CardTitle>
                <CardDescription>OCR cost from persisted provider runs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border p-4">
                  <div className="text-sm text-muted-foreground">Today</div>
                  <div className="text-2xl font-semibold">{usd(spend.today.spentUsd)} / {usd(spend.today.capUsd)}</div>
                </div>
                <SimpleTable
                  headers={["Date", "Spent"]}
                  rows={spend.last30Days.map((day) => [day.date, usd(day.spentUsd)])}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="runs">
            <Card>
              <CardHeader>
                <CardTitle>OCR Runs</CardTitle>
                <CardDescription>Latest runs without bill content.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 overflow-x-auto">
                <div className="min-w-[760px]">
                  <SimpleTable
                    headers={["Status", "Provider", "Model", "Latency", "Cost", "Image hash", "Time"]}
                    rows={visibleRuns.map((run) => [
                      run.ok ? "✓ ok" : `✗ ${run.error ?? "error"}`,
                      run.provider,
                      run.model,
                      `${run.latencyMs}ms`,
                      usd(run.costUsd),
                      run.imageHash.slice(0, 12),
                      new Date(run.createdAt).toLocaleString(),
                    ])}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Button variant="outline" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">Page {page + 1}</span>
                  <Button variant="outline" disabled={(page + 1) * 50 >= runs.length} onClick={() => setPage((value) => value + 1)}>
                    Next
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Voting quorum</CardTitle>
                <CardDescription>Leave blank for automatic majority voting.</CardDescription>
              </CardHeader>
              <CardContent className="max-w-sm space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="quorum">Override</Label>
                  <Input
                    id="quorum"
                    inputMode="numeric"
                    placeholder="auto"
                    value={quorum}
                    onChange={(event) => setQuorum(event.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <Button onClick={saveQuorum} disabled={savingQuorum}>
                  {savingQuorum ? "Saving…" : "Save quorum"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-lg border text-sm">
      <div className="grid grid-cols-[repeat(var(--cols),minmax(0,1fr))] bg-muted px-3 py-2 font-medium" style={{ "--cols": headers.length } as React.CSSProperties}>
        {headers.map((header) => <div key={header}>{header}</div>)}
      </div>
      <div className="divide-y">
        {rows.length > 0 ? rows.map((row, index) => (
          <div key={index} className="grid grid-cols-[repeat(var(--cols),minmax(0,1fr))] gap-2 px-3 py-2" style={{ "--cols": headers.length } as React.CSSProperties}>
            {row.map((cell, cellIndex) => <div key={cellIndex} className="truncate">{cell}</div>)}
          </div>
        )) : <div className="px-3 py-6 text-center text-muted-foreground">No data</div>}
      </div>
    </div>
  );
}
