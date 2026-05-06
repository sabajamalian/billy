import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScanUploader } from "@/components/scan/ScanUploader";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

type TestScanEvent =
  | { type: "scan.started"; modelCount: number }
  | { type: "provider.done" | "provider.failed"; provider: string; model: string; cached: boolean; error?: string }
  | { type: "voting.done"; itemsCount: number; subtotalMismatch: boolean }
  | { type: "scan.complete"; billShareToken: string; billId: string }
  | { type: "scan.failed"; reason: string; errorType?: string; retryAfterSeconds?: number };

const file = () => new File(["receipt"], "receipt.jpg", { type: "image/jpeg" });

const streamFor = (events: TestScanEvent[]) => {
  const encoder = new TextEncoder();
  const chunks = events.map((event) => encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
};

const mockScanResponse = (events: TestScanEvent[]) => {
  vi.mocked(fetch).mockResolvedValue(new Response(streamFor(events), { status: 200, headers: { "Content-Type": "text/event-stream" } }));
};

const pickReceiptAndScan = async () => {
  render(<ScanUploader />);
  fireEvent.change(screen.getByLabelText("Upload receipt from gallery"), { target: { files: [file()] } });
  fireEvent.click(screen.getByRole("button", { name: "Scan" }));
};

describe("ScanUploader error states", () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:receipt"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders all failed state when every provider fails", async () => {
    mockScanResponse([
      { type: "scan.started", modelCount: 2 },
      { type: "provider.failed", provider: "openai", model: "gpt-4o", cached: false, error: "timeout" },
      { type: "provider.failed", provider: "google", model: "gemini-1.5-flash", cached: false, error: "bad json" },
      { type: "scan.failed", reason: "All OCR providers failed", errorType: "internal" },
    ]);

    await pickReceiptAndScan();

    expect(await screen.findByRole("heading", { name: "All OCR providers failed" })).toBeInTheDocument();
    expect(screen.getByText(/openai:gpt-4o — timeout/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByText("Enter the bill manually").closest("a")).toHaveAttribute("href", "/scan/manual");
  });

  it("renders rate limited state with a countdown", async () => {
    vi.useFakeTimers();
    mockScanResponse([{ type: "scan.failed", reason: "Per-IP scan limit exceeded. Retry in 3 seconds.", errorType: "rate_limited", retryAfterSeconds: 3 }]);

    await pickReceiptAndScan();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "Scanning is cooling down" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry in 3s" })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("renders no models state with manual entry CTA", async () => {
    mockScanResponse([{ type: "scan.failed", reason: "No OCR models are configured", errorType: "no_models" }]);

    await pickReceiptAndScan();

    expect(await screen.findByRole("heading", { name: "No OCR models configured" })).toBeInTheDocument();
    expect(screen.getByText("Enter manually").closest("a")).toHaveAttribute("href", "/scan/manual");
  });

  it("renders partial success with bill links and retry option", async () => {
    mockScanResponse([
      { type: "scan.started", modelCount: 3 },
      { type: "provider.done", provider: "openai", model: "gpt-4o", cached: false },
      { type: "provider.failed", provider: "google", model: "gemini-1.5-flash", cached: false, error: "timeout" },
      { type: "voting.done", itemsCount: 4, subtotalMismatch: false },
      { type: "scan.complete", billShareToken: "share-1", billId: "bill-1" },
    ]);

    await pickReceiptAndScan();

    expect(await screen.findByRole("heading", { name: "Bill created with review flags" })).toBeInTheDocument();
    expect(screen.getByText("Skipped models: 1")).toBeInTheDocument();
    expect(screen.getByText("Open the bill").closest("a")).toHaveAttribute("href", "/b/share-1");
    expect(screen.getByText("Edit before sharing").closest("a")).toHaveAttribute("href", "/b/share-1/edit");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalledWith("/b/share-1");
  });
});
