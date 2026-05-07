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

type ProviderId = "openai" | "anthropic" | "google";
type KeySource = "db" | "env" | "none" | "error";
type ProviderKeyStatus = { source: KeySource; last4: string | null };
type ProviderKeysPresent = { openai: boolean; anthropic: boolean; google: boolean };
type ProviderKeyStatusMap = Record<ProviderId, ProviderKeyStatus>;
type SettingsData = {
  activeModels: ConfiguredModel[];
  availableModels: string[];
  quorumOverride: number | null;
  providerKeysPresent: ProviderKeysPresent;
  providerKeyStatus: ProviderKeyStatusMap;
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
  const [keyStatus, setKeyStatus] = useState<ProviderKeyStatusMap>(settings.providerKeyStatus);
  const [keyDrafts, setKeyDrafts] = useState<Record<ProviderId, string>>({ openai: "", anthropic: "", google: "" });
  const [keyBusy, setKeyBusy] = useState<ProviderId | null>(null);
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

  async function saveProviderKey(provider: ProviderId) {
    const apiKey = keyDrafts[provider].trim();
    if (!apiKey) return;
    setKeyBusy(provider);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        setMessage(`Save failed: ${(detail as { detail?: string }).detail ?? response.statusText}`);
        return;
      }
      const data = (await response.json()) as { providers: ProviderKeyStatusMap };
      setKeyStatus(data.providers);
      setKeyDrafts((current) => ({ ...current, [provider]: "" }));
      setMessage(`Saved ${provider} key.`);
      router.refresh();
    } finally {
      setKeyBusy(null);
    }
  }

  async function clearProviderKey(provider: ProviderId) {
    setKeyBusy(provider);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!response.ok) {
        setMessage(`Clear failed: ${response.statusText}`);
        return;
      }
      const data = (await response.json()) as { providers: ProviderKeyStatusMap };
      setKeyStatus(data.providers);
      setMessage(`Cleared ${provider} key.`);
      router.refresh();
    } finally {
      setKeyBusy(null);
    }
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
            <TabsTrigger value="keys">Keys</TabsTrigger>
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

          <TabsContent value="keys">
            <Card>
              <CardHeader>
                <CardTitle>Provider API keys</CardTitle>
                <CardDescription>
                  Stored encrypted at rest. DB-stored keys take precedence over environment variables.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(["openai", "anthropic", "google"] as const).map((provider) => {
                  const status = keyStatus[provider];
                  const draft = keyDrafts[provider];
                  const busy = keyBusy === provider;
                  return (
                    <div key={provider} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">{provider}</span>
                          <KeyStatusBadge status={status} />
                        </div>
                        {status.source === "db" || status.source === "error" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => clearProviderKey(provider)}
                          >
                            {busy ? "…" : "Clear"}
                          </Button>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          type="password"
                          autoComplete="off"
                          placeholder={`Paste ${provider} API key`}
                          value={draft}
                          onChange={(event) =>
                            setKeyDrafts((current) => ({ ...current, [provider]: event.target.value }))
                          }
                          aria-label={`${provider} API key`}
                        />
                        <Button onClick={() => saveProviderKey(provider)} disabled={busy || draft.trim().length === 0}>
                          {busy ? "Saving…" : "Save"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">
                  Keys are encrypted with AES-256-GCM. Set <code className="rounded bg-muted px-1 py-0.5">BILLY_KEY_ENCRYPTION_SECRET</code>
                  {" "}(64 hex chars) to use a host-managed master key, otherwise one is generated and persisted alongside the database.
                </p>
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

function KeyStatusBadge({ status }: { status: ProviderKeyStatus }) {
  if (status.source === "db") {
    return <Badge variant="secondary">DB · ****{status.last4 ?? "????"}</Badge>;
  }
  if (status.source === "env") {
    return <Badge variant="outline">env</Badge>;
  }
  if (status.source === "error") {
    return <Badge variant="destructive">decrypt failed</Badge>;
  }
  return <Badge variant="outline">not set</Badge>;
}
