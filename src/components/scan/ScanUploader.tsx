"use client";

import { Camera, CheckCircle2, ImageIcon, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export type ScanUploaderProps = { existingShareToken?: string };

type ProviderStatus = "done" | "failed";
type ProviderBadge = {
  key: string;
  provider: string;
  model: string;
  status: ProviderStatus;
  cached: boolean;
};

type ScanEvent =
  | { type: "scan.started"; modelCount: number }
  | { type: "provider.done" | "provider.failed"; provider: string; model: string; cached: boolean }
  | { type: "voting.done"; itemsCount: number; subtotalMismatch: boolean }
  | { type: "scan.complete"; billShareToken: string; billId: string }
  | { type: "scan.failed"; reason: string }
  | { type: "error"; message: string };

const scanEndpoint = (existingShareToken?: string) =>
  existingShareToken ? `/api/bills/${encodeURIComponent(existingShareToken)}/rescan` : "/api/bills/scan";

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

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onPickFile = (picked: File | undefined) => {
    if (!picked) return;
    if (!picked.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    setFile(picked);
    setProviders([]);
    setExpectedModels(null);
    setStatusText("Receipt ready. Start the scan when you're ready.");
  };

  const applyEvent = (event: ScanEvent) => {
    if (event.type === "scan.started") {
      setExpectedModels(event.modelCount);
      setStatusText(`Scanning with ${event.modelCount} model${event.modelCount === 1 ? "" : "s"}…`);
      return;
    }

    if (event.type === "provider.done" || event.type === "provider.failed") {
      const status: ProviderStatus = event.type === "provider.done" ? "done" : "failed";
      const key = `${event.provider}:${event.model}`;
      setProviders((current) => [
        ...current.filter((provider) => provider.key !== key),
        { key, provider: event.provider, model: event.model, status, cached: event.cached },
      ]);
      return;
    }

    if (event.type === "voting.done") {
      setStatusText(
        event.subtotalMismatch
          ? `Found ${event.itemsCount} items. Subtotal needs host review.`
          : `Found ${event.itemsCount} items. Finalizing bill…`,
      );
      return;
    }

    if (event.type === "scan.complete") {
      setStatusText("Scan complete. Opening bill…");
      router.push(`/b/${event.billShareToken}`);
      return;
    }

    if (event.type === "scan.failed" || event.type === "error") {
      throw new Error(event.type === "scan.failed" ? event.reason : event.message);
    }
  };

  const scan = async () => {
    if (!file || isScanning) return;

    setIsScanning(true);
    setProviders([]);
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
          onChange={(event) => onPickFile(event.target.files?.[0])}
        />
        <input
          ref={galleryInputRef}
          className="sr-only"
          type="file"
          accept="image/*"
          onChange={(event) => onPickFile(event.target.files?.[0])}
        />
        <Button className="h-12 text-base" type="button" onClick={() => cameraInputRef.current?.click()} disabled={isScanning}>
          <Camera aria-hidden="true" /> Take a photo
        </Button>
        <Button
          className="h-12 text-base"
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
          <img src={previewUrl} alt="Selected receipt preview" className="max-h-80 w-full object-contain bg-zinc-100 dark:bg-zinc-900" />
        </div>
      ) : null}

      <div className="mt-6 flex items-center gap-3">
        <Button className="h-12 flex-1 text-base" type="button" onClick={() => void scan()} disabled={!file || isScanning}>
          {isScanning ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {isScanning ? "Scanning…" : "Scan"}
        </Button>
      </div>

      <section className="mt-6 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-900" aria-live="polite" aria-label="Scan progress">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{statusText}</p>
        {expectedModels !== null ? (
          <p className="mt-1 text-xs text-zinc-500">
            {providers.length} of {expectedModels} model responses received
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {providers.map((provider) => (
            <span
              key={provider.key}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
            >
              {provider.status === "done" ? (
                <CheckCircle2 className="size-3 text-emerald-600" aria-hidden="true" />
              ) : (
                <XCircle className="size-3 text-red-600" aria-hidden="true" />
              )}
              {provider.provider}:{provider.model}
              {provider.cached ? " (cached)" : ""}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
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
