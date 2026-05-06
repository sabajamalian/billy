"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Hourglass,
  ImageIcon,
  Loader2,
  RefreshCw,
  Settings2,
  ShieldAlert,
  WalletCards,
  WifiOff,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export type ScanUploaderProps = { existingShareToken?: string };

type ProviderStatus = "done" | "failed";
type ErrorType =
  | "rate_limited"
  | "budget_exhausted"
  | "retry_exhausted"
  | "image_error"
  | "no_models"
  | "internal";

type ProviderBadge = {
  key: string;
  provider: string;
  model: string;
  status: ProviderStatus;
  cached: boolean;
  error?: string;
};

type ScanState =
  | { status: "idle" }
  | { status: "ready" }
  | { status: "scanning" }
  | { status: "partial_success"; shareToken: string; billId: string; skippedModels: number }
  | { status: "subtotal_mismatch"; shareToken: string; billId: string; skippedModels: number }
  | { status: "all_failed"; reason: string }
  | { status: "rate_limited"; reason: string; retryAfterSeconds: number }
  | { status: "budget_exhausted"; reason: string }
  | { status: "retry_exhausted"; reason: string }
  | { status: "image_error"; reason: string }
  | { status: "network_error"; reason: string }
  | { status: "no_models"; reason: string };

type ScanEvent =
  | { type: "scan.started"; modelCount: number }
  | { type: "provider.done" | "provider.failed"; provider: string; model: string; cached: boolean; error?: string }
  | { type: "voting.done"; itemsCount: number; subtotalMismatch: boolean }
  | { type: "scan.complete"; billShareToken: string; billId: string }
  | { type: "scan.failed"; reason: string; errorType?: ErrorType; retryAfterSeconds?: number }
  | { type: "error"; message: string };

class ScanFailure extends Error {
  errorType: ErrorType;
  retryAfterSeconds?: number;

  constructor(event: Extract<ScanEvent, { type: "scan.failed" }>) {
    super(event.reason);
    this.name = "ScanFailure";
    this.errorType = event.errorType ?? "internal";
    this.retryAfterSeconds = event.retryAfterSeconds;
  }
}

const scanEndpoint = (existingShareToken?: string) =>
  existingShareToken ? `/api/bills/${encodeURIComponent(existingShareToken)}/rescan` : "/api/bills/scan";

const manualHref = (existingShareToken?: string) => (existingShareToken ? `/b/${existingShareToken}/edit` : "/scan/manual");

const retrySecondsFrom = (reason: string, explicit?: number) => {
  if (explicit !== undefined) return explicit;
  const match = reason.match(/(\d+)\s*(?:s|sec|second)/i);
  return match ? Number(match[1]) : 0;
};

const skippedCount = (expectedModels: number | null, providerCount: number) => Math.max(0, (expectedModels ?? providerCount) - providerCount);

export function ScanUploader({ existingShareToken }: ScanUploaderProps) {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [expectedModels, setExpectedModels] = useState<number | null>(null);
  const [providers, setProviders] = useState<ProviderBadge[]>([]);
  const [statusText, setStatusText] = useState("Choose a receipt photo to begin.");
  const [votingSubtotalMismatch, setVotingSubtotalMismatch] = useState(false);
  const [votingComplete, setVotingComplete] = useState(false);
  const [state, setState] = useState<ScanState>({ status: "idle" });
  const expectedModelsRef = useRef<number | null>(null);
  const providersRef = useRef<ProviderBadge[]>([]);
  const votingSubtotalMismatchRef = useRef(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (state.status !== "rate_limited" || state.retryAfterSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setState((current) =>
        current.status === "rate_limited"
          ? { ...current, retryAfterSeconds: Math.max(0, current.retryAfterSeconds - 1) }
          : current,
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  const resetProgress = () => {
    providersRef.current = [];
    expectedModelsRef.current = null;
    votingSubtotalMismatchRef.current = false;
    setProviders([]);
    setExpectedModels(null);
    setVotingSubtotalMismatch(false);
    setVotingComplete(false);
  };

  const resetToIdle = () => {
    setFile(null);
    resetProgress();
    setState({ status: "idle" });
    setStatusText("Choose a receipt photo to begin.");
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  const onPickFile = (picked: File | undefined) => {
    if (!picked) return;
    if (!picked.type.startsWith("image/")) {
      const reason = "Please choose an image file.";
      setState({ status: "image_error", reason });
      setStatusText(reason);
      toast.error(reason);
      return;
    }
    setFile(picked);
    resetProgress();
    setState({ status: "ready" });
    setStatusText("Receipt ready. Start the scan when you're ready.");
  };

  const applyEvent = (event: ScanEvent) => {
    if (event.type === "scan.started") {
      expectedModelsRef.current = event.modelCount;
      setExpectedModels(event.modelCount);
      setState({ status: "scanning" });
      setStatusText(`Scanning with ${event.modelCount} model${event.modelCount === 1 ? "" : "s"}…`);
      return;
    }

    if (event.type === "provider.done" || event.type === "provider.failed") {
      const status: ProviderStatus = event.type === "provider.done" ? "done" : "failed";
      const key = `${event.provider}:${event.model}`;
      const nextProviders = [
        ...providersRef.current.filter((provider) => provider.key !== key),
        { key, provider: event.provider, model: event.model, status, cached: event.cached, error: event.error },
      ];
      providersRef.current = nextProviders;
      setProviders(nextProviders);
      return;
    }

    if (event.type === "voting.done") {
      votingSubtotalMismatchRef.current = event.subtotalMismatch;
      setVotingSubtotalMismatch(event.subtotalMismatch);
      setVotingComplete(true);
      setStatusText(
        event.subtotalMismatch
          ? `Found ${event.itemsCount} items. Subtotal needs host review.`
          : `Found ${event.itemsCount} items. Finalizing bill…`,
      );
      return;
    }

    if (event.type === "scan.complete") {
      const skippedModels = skippedCount(expectedModelsRef.current, providersRef.current.length);
      setStatusText("Scan complete.");
      if (votingSubtotalMismatchRef.current) {
        setState({ status: "subtotal_mismatch", shareToken: event.billShareToken, billId: event.billId, skippedModels });
        router.push(`/b/${event.billShareToken}/edit`);
        return;
      }
      if (providersRef.current.some((provider) => provider.status === "failed")) {
        setState({ status: "partial_success", shareToken: event.billShareToken, billId: event.billId, skippedModels });
        toast.error("Some OCR providers failed. Review flagged items before sharing.");
        return;
      }
      router.push(`/b/${event.billShareToken}`);
      return;
    }

    if (event.type === "scan.failed") {
      throw new ScanFailure(event);
    }

    if (event.type === "error") {
      throw new Error(event.message);
    }
  };

  const stateForFailure = (failure: ScanFailure): ScanState => {
    if (failure.errorType === "rate_limited") {
      return { status: "rate_limited", reason: failure.message, retryAfterSeconds: retrySecondsFrom(failure.message, failure.retryAfterSeconds) };
    }
    if (failure.errorType === "budget_exhausted") return { status: "budget_exhausted", reason: failure.message };
    if (failure.errorType === "retry_exhausted") return { status: "retry_exhausted", reason: failure.message };
    if (failure.errorType === "image_error") return { status: "image_error", reason: failure.message };
    if (failure.errorType === "no_models") return { status: "no_models", reason: failure.message };
    if (providersRef.current.length > 0 && providersRef.current.every((provider) => provider.status === "failed")) return { status: "all_failed", reason: failure.message };
    return { status: "all_failed", reason: failure.message };
  };

  const scan = async () => {
    if (!file || isScanning) return;

    setIsScanning(true);
    resetProgress();
    setState({ status: "scanning" });
    setStatusText("Uploading receipt…");

    const formData = new FormData();
    formData.set("image", file);

    try {
      const response = await fetch(scanEndpoint(existingShareToken), {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: formData,
      });

      if (!response.ok && !response.body) {
        const payload = (await response.json().catch(() => null)) as { detail?: string; error?: string } | null;
        throw new Error(payload?.detail ?? payload?.error ?? "Scan failed");
      }

      if (!response.body) {
        const payload = (await response.json()) as { shareToken: string };
        router.push(`/b/${payload.shareToken}`);
        return;
      }

      await readEventStream(response.body, applyEvent);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scan failed";
      setStatusText(message);
      if (err instanceof ScanFailure) {
        setState(stateForFailure(err));
      } else {
        setState({ status: "network_error", reason: message });
      }
      toast.error(message, { action: { label: "Retry", onClick: () => void scan() } });
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="w-full rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="space-y-2 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Billy receipt scan</p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          {existingShareToken ? "Rescan this bill" : "Scan a bill"}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Take a clear photo of the full receipt, including totals.</p>
      </div>

      <div className="mt-6 grid gap-3">
        <input
          ref={cameraInputRef}
          className="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Take receipt photo"
          onChange={(event) => onPickFile(event.target.files?.[0])}
        />
        <input
          ref={galleryInputRef}
          className="sr-only"
          type="file"
          accept="image/*"
          aria-label="Upload receipt from gallery"
          onChange={(event) => onPickFile(event.target.files?.[0])}
        />
        <Button className="min-h-11 h-12 text-base" type="button" onClick={() => cameraInputRef.current?.click()} disabled={isScanning}>
          <Camera aria-hidden="true" /> Take a photo
        </Button>
        <Button
          className="min-h-11 h-12 text-base"
          type="button"
          variant="secondary"
          onClick={() => galleryInputRef.current?.click()}
          disabled={isScanning}
        >
          <ImageIcon aria-hidden="true" /> Upload from gallery
        </Button>
      </div>

      {previewUrl ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Selected receipt preview" className="max-h-80 w-full bg-zinc-100 object-contain dark:bg-zinc-900" />
        </div>
      ) : null}

      <div className="mt-6 flex items-center gap-3">
        <Button
          className="min-h-11 h-12 flex-1 text-base"
          type="button"
          onClick={() => void scan()}
          disabled={!file || isScanning || (state.status === "rate_limited" && state.retryAfterSeconds > 0)}
        >
          {isScanning ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {isScanning ? "Scanning…" : "Scan"}
        </Button>
      </div>

      <ScanStatusPanel
        state={state}
        statusText={statusText}
        expectedModels={expectedModels}
        providers={providers}
        votingComplete={votingComplete}
        onRetry={() => void scan()}
        onReset={resetToIdle}
        manualHref={manualHref(existingShareToken)}
      />
    </div>
  );
}

type ScanStatusPanelProps = {
  state: ScanState;
  statusText: string;
  expectedModels: number | null;
  providers: ProviderBadge[];
  votingComplete: boolean;
  onRetry: () => void;
  onReset: () => void;
  manualHref: string;
};

function ScanStatusPanel({ state, statusText, expectedModels, providers, votingComplete, onRetry, onReset, manualHref }: ScanStatusPanelProps) {
  const skippedModels = votingComplete ? skippedCount(expectedModels, providers.length) : 0;

  return (
    <Card className="mt-6 rounded-2xl bg-zinc-50 shadow-none dark:bg-zinc-900" aria-live="polite" aria-label="Scan progress">
      <CardContent className="space-y-4">
        {state.status === "scanning" ? (
          <StateHeader icon={<Loader2 className="animate-spin text-blue-600" />} title="Scanning receipt" description={statusText} />
        ) : null}
        {state.status === "idle" ? (
          <StateHeader icon={<Camera className="text-zinc-500" />} title="Ready for a receipt" description="Choose a clear photo of the whole receipt to start splitting this bill." />
        ) : null}
        {state.status === "ready" ? (
          <StateHeader icon={<CheckCircle2 className="text-emerald-600" />} title="Receipt ready" description="Start the scan when you're ready. We'll compare model results and flag anything that needs review." />
        ) : null}
        {state.status === "partial_success" ? (
          <StateHeader
            icon={<AlertTriangle className="text-amber-600" />}
            title="Bill created with review flags"
            description="Some OCR providers failed, but enough results matched to create the bill. Review flagged items before sharing it with guests."
          />
        ) : null}
        {state.status === "subtotal_mismatch" ? (
          <StateHeader
            icon={<ShieldAlert className="text-amber-600" />}
            title="Subtotal needs host review"
            description="The scanned items do not add up to the receipt subtotal. We opened the host editor so you can reconcile it before sharing."
          />
        ) : null}
        {state.status === "all_failed" ? (
          <StateHeader
            icon={<XCircle className="text-red-600" />}
            title="All OCR providers failed"
            description={`${state.reason}. Try another scan, or enter the bill manually so guests can still split it.`}
          />
        ) : null}
        {state.status === "rate_limited" ? (
          <StateHeader
            icon={<Hourglass className="text-amber-600" />}
            title="Scanning is cooling down"
            description={
              state.retryAfterSeconds > 0
                ? `${state.reason}. You can retry in ${state.retryAfterSeconds} second${state.retryAfterSeconds === 1 ? "" : "s"}.`
                : `${state.reason}. You can retry now.`
            }
          />
        ) : null}
        {state.status === "budget_exhausted" ? (
          <StateHeader
            icon={<WalletCards className="text-amber-600" />}
            title="Daily OCR budget is exhausted"
            description={`${state.reason}. Manual entry is available and keeps the bill moving without OCR.`}
          />
        ) : null}
        {state.status === "retry_exhausted" ? (
          <StateHeader
            icon={<RefreshCw className="text-amber-600" />}
            title="Retry limit reached"
            description={`${state.reason}. Enter the bill manually or come back when rescans are available again.`}
          />
        ) : null}
        {state.status === "image_error" ? (
          <StateHeader
            icon={<ImageIcon className="text-red-600" />}
            title="Photo cannot be scanned"
            description={`${state.reason}. Pick another photo with a supported format and the full receipt visible.`}
          />
        ) : null}
        {state.status === "network_error" ? (
          <StateHeader
            icon={<WifiOff className="text-red-600" />}
            title="Network interrupted"
            description={`${state.reason}. Check your connection and try the scan again.`}
          />
        ) : null}
        {state.status === "no_models" ? (
          <StateHeader
            icon={<Settings2 className="text-red-600" />}
            title="No OCR models configured"
            description={`${state.reason}. Manual entry is available while an admin enables OCR models.`}
          />
        ) : null}

        {(expectedModels !== null || providers.length > 0) && <ProviderProgress expectedModels={expectedModels} providers={providers} skippedModels={skippedModels} />}

        <StateActions state={state} onRetry={onRetry} onReset={onReset} manualHref={manualHref} />
      </CardContent>
    </Card>
  );
}

function StateHeader({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 [&>svg]:size-5" aria-hidden="true">
        {icon}
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">{title}</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      </div>
    </div>
  );
}

function ProviderProgress({ expectedModels, providers, skippedModels }: { expectedModels: number | null; providers: ProviderBadge[]; skippedModels: number }) {
  return (
    <div className="space-y-3">
      <Separator />
      {expectedModels !== null ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>
            {providers.length} of {expectedModels} model responses received
          </span>
          {skippedModels > 0 ? <Badge variant="outline">Skipped models: {skippedModels}</Badge> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {providers.map((provider) => (
          <Badge key={provider.key} variant={provider.status === "done" ? "outline" : "destructive"} className="h-auto min-h-7 max-w-full justify-start rounded-full py-1">
            {provider.status === "done" ? (
              <CheckCircle2 className="size-3 text-emerald-600" aria-hidden="true" />
            ) : (
              <XCircle className="size-3 text-red-600" aria-hidden="true" />
            )}
            <span className="truncate">
              {provider.provider}:{provider.model}
              {provider.cached ? " (cached)" : ""}
              {provider.status === "failed" ? ` — ${provider.error || "failed"}` : ""}
            </span>
          </Badge>
        ))}
      </div>
    </div>
  );
}

function StateActions({ state, onRetry, onReset, manualHref }: { state: ScanState; onRetry: () => void; onReset: () => void; manualHref: string }) {
  if (state.status === "idle" || state.status === "ready" || state.status === "scanning") return null;

  if (state.status === "partial_success") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Button className="min-h-11" nativeButton={false} render={<Link href={`/b/${state.shareToken}`} />}>Open the bill</Button>
        <Button className="min-h-11" variant="secondary" nativeButton={false} render={<Link href={`/b/${state.shareToken}/edit`} />}>Edit before sharing</Button>
        <Button className="min-h-11 sm:col-span-2" type="button" variant="outline" onClick={onRetry}>Try again</Button>
      </div>
    );
  }

  if (state.status === "subtotal_mismatch") {
    return <Button className="min-h-11 w-full" nativeButton={false} render={<Link href={`/b/${state.shareToken}/edit`} />}>Review with the host</Button>;
  }

  if (state.status === "all_failed") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Button className="min-h-11" type="button" onClick={onRetry}>Try again</Button>
        <Button className="min-h-11" variant="secondary" nativeButton={false} render={<Link href={manualHref} />}>Enter the bill manually</Button>
      </div>
    );
  }

  if (state.status === "rate_limited") {
    return (
      <Button className="min-h-11 w-full" type="button" onClick={onRetry} disabled={state.retryAfterSeconds > 0}>
        {state.retryAfterSeconds > 0 ? `Retry in ${state.retryAfterSeconds}s` : "Try again"}
      </Button>
    );
  }

  if (state.status === "budget_exhausted" || state.status === "retry_exhausted" || state.status === "no_models") {
    return <Button className="min-h-11 w-full" nativeButton={false} render={<Link href={manualHref} />}>Enter manually</Button>;
  }

  if (state.status === "image_error") {
    return <Button className="min-h-11 w-full" type="button" onClick={onReset}>Pick another photo</Button>;
  }

  return <Button className="min-h-11 w-full" type="button" onClick={onRetry}>Try again</Button>;
}

async function readEventStream(stream: ReadableStream<Uint8Array>, onEvent: (event: ScanEvent) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const messages = buffer.split("\n\n");
    buffer = messages.pop() ?? "";
    for (const message of messages) {
      const dataLine = message.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      onEvent(JSON.parse(dataLine.slice(6)) as ScanEvent);
    }
  }
}
