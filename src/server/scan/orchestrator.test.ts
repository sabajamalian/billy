import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BillWithItems } from "@/server/billing/bill-service";
import { ImageValidationError, type PreprocessedImage } from "@/server/ocr/preprocess";
import type { OcrRun } from "@/server/ocr/providers";
import type { VotedBill } from "@/server/ocr/voting";

const mocks = vi.hoisted(() => ({
  preprocessImageMock: vi.fn(),
  runOcrMock: vi.fn(),
  getActiveModelsMock: vi.fn(),
  getQuorumOverrideMock: vi.fn(),
  voteOcrMock: vi.fn(),
  createBillMock: vi.fn(),
  replaceItemsMock: vi.fn(),
  updateBillSummaryMock: vi.fn(),
  prismaBillFindUniqueMock: vi.fn(),
  ipCheckMock: vi.fn(),
  ipConsumeMock: vi.fn(),
  retryCheckMock: vi.fn(),
  retryConsumeMock: vi.fn(),
  budgetCheckMock: vi.fn(),
  budgetRecordMock: vi.fn(),
}));

const {
  preprocessImageMock,
  runOcrMock,
  getActiveModelsMock,
  getQuorumOverrideMock,
  voteOcrMock,
  createBillMock,
  replaceItemsMock,
  updateBillSummaryMock,
  prismaBillFindUniqueMock,
  ipCheckMock,
  ipConsumeMock,
  retryCheckMock,
  retryConsumeMock,
  budgetCheckMock,
  budgetRecordMock,
} = mocks;

vi.mock("@/server/ocr/preprocess", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/ocr/preprocess")>();
  return { ...actual, preprocessImage: mocks.preprocessImageMock };
});

vi.mock("@/server/ocr/providers", () => ({
  runOcr: mocks.runOcrMock,
}));

vi.mock("@/server/admin/settings", () => ({
  getActiveModels: mocks.getActiveModelsMock,
  getQuorumOverride: mocks.getQuorumOverrideMock,
}));

vi.mock("@/server/ocr/voting", () => ({ voteOcr: mocks.voteOcrMock }));

vi.mock("@/server/billing/bill-service", () => ({
  createBill: mocks.createBillMock,
  replaceItems: mocks.replaceItemsMock,
  updateBillSummary: mocks.updateBillSummaryMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { bill: { findUnique: mocks.prismaBillFindUniqueMock } },
}));

vi.mock("@/server/limits/rate-limit", () => ({
  ipScanLimit: { check: mocks.ipCheckMock, consume: mocks.ipConsumeMock },
  billRetryLimit: { check: mocks.retryCheckMock, consume: mocks.retryConsumeMock },
}));

vi.mock("@/server/limits/budget", () => ({
  llmBudget: { check: mocks.budgetCheckMock, record: mocks.budgetRecordMock },
}));

const bill = (overrides: Partial<BillWithItems> = {}): BillWithItems => ({
  id: "bill-1",
  shareToken: "share-1",
  hostTokenHash: "hash",
  status: "SCANNING",
  imagePath: null,
  currency: "USD",
  taxCents: 0,
  tipInputType: "FLAT",
  tipInputValue: 0,
  tipResolvedCents: 0,
  acceptedMismatch: false,
  version: 0,
  createdAt: new Date("2026-05-06T00:00:00Z"),
  updatedAt: new Date("2026-05-06T00:00:00Z"),
  expiresAt: new Date("2026-05-13T00:00:00Z"),
  items: [],
  ...overrides,
});

const image: PreprocessedImage = {
  buffer: Buffer.from("processed"),
  mimeType: "image/jpeg",
  imageHash: "hash",
  width: 100,
  height: 100,
  originalBytes: 10,
};

const successfulRun = (provider: string, model: string, costUsd = 0.01): OcrRun => ({
  provider,
  model,
  ok: true,
  cached: false,
  latencyMs: 10,
  costUsd,
  result: {
    items: [{ name: "Burger", quantity: 1, unitPriceCents: 1200 }],
    taxCents: 100,
    tipCents: 200,
    subtotalCents: 1200,
    totalCents: 1500,
    currency: "USD",
  },
});

const votedBill = (overrides: Partial<VotedBill> = {}): VotedBill => ({
  items: [
    { name: "Burger", quantity: 1, unitPriceCents: 1200, confidence: 1, flagged: false },
    { name: "Fries", quantity: 1, unitPriceCents: 500, confidence: 1, flagged: false },
    { name: "Soda", quantity: 1, unitPriceCents: 300, confidence: 1, flagged: false },
  ],
  taxCents: 150,
  tipCents: 300,
  subtotalCents: 2000,
  totalCents: 2450,
  votedItemsTotalCents: 2000,
  subtotalMismatch: false,
  subtotalMismatchDetail: { itemsTotalCents: 2000, subtotalCents: 2000, toleranceCents: 50 },
  successfulRunCount: 2,
  totalRunCount: 2,
  ...overrides,
});

const setupHappyMocks = () => {
  const initialBill = bill();
  const itemsBill = bill({ version: 1 });
  const summaryBill = bill({ version: 2, taxCents: 150, tipResolvedCents: 300 });

  ipCheckMock.mockReturnValue({ allowed: true });
  retryCheckMock.mockReturnValue({ allowed: true });
  budgetCheckMock.mockReturnValue({ allowed: true, spentToday: 0, capUsd: 1 });
  preprocessImageMock.mockResolvedValue(image);
  getActiveModelsMock.mockResolvedValue([
    { provider: "openai", model: "gpt-4o" },
    { provider: "google", model: "gemini-1.5-flash" },
  ]);
  getQuorumOverrideMock.mockResolvedValue(null);
  runOcrMock.mockResolvedValue({
    runs: [successfulRun("openai", "gpt-4o"), successfulRun("google", "gemini-1.5-flash", 0.02)],
    totalLatencyMs: 20,
    totalCostUsd: 0.03,
    modelSetKey: "google:gemini-1.5-flash,openai:gpt-4o",
  });
  voteOcrMock.mockReturnValue(votedBill());
  createBillMock.mockResolvedValue({ bill: initialBill, shareToken: "share-1", hostToken: "host-1" });
  replaceItemsMock.mockResolvedValue(itemsBill);
  updateBillSummaryMock.mockResolvedValue(summaryBill);
  prismaBillFindUniqueMock.mockResolvedValue(initialBill);
};

describe("runScan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHappyMocks();
  });

  it("persists voted items and tax/tip on the happy path", async () => {
    const { runScan } = await import("@/server/scan/orchestrator");

    const result = await runScan({ imageBuffer: Buffer.from("receipt"), ip: "1.2.3.4" });

    expect(createBillMock).toHaveBeenCalledTimes(1);
    expect(replaceItemsMock).toHaveBeenCalledWith(expect.objectContaining({ id: "bill-1" }), votedBill().items);
    expect(updateBillSummaryMock).toHaveBeenCalledWith(expect.objectContaining({ id: "bill-1" }), {
      taxCents: 150,
      tip: { type: "FLAT", value: 300 },
      currency: "USD",
    });
    expect(budgetRecordMock).toHaveBeenCalledWith(0.03);
    expect(result).toMatchObject({ shareToken: "share-1", hostToken: "host-1", billId: "bill-1" });
  });

  it("throws RateLimitError without preprocessing when IP limit blocks", async () => {
    ipCheckMock.mockReturnValue({ allowed: false, retryAfterSeconds: 60, reason: "scan limit exceeded" });
    const { RateLimitError, runScan } = await import("@/server/scan/orchestrator");

    await expect(runScan({ imageBuffer: Buffer.from("receipt"), ip: "1.2.3.4" })).rejects.toBeInstanceOf(RateLimitError);
    expect(preprocessImageMock).not.toHaveBeenCalled();
  });

  it("throws BudgetExceededError when the daily cap is exhausted", async () => {
    budgetCheckMock.mockReturnValue({ allowed: false, spentToday: 1, capUsd: 1, reason: "daily LLM budget exceeded" });
    const { BudgetExceededError, runScan } = await import("@/server/scan/orchestrator");

    await expect(runScan({ imageBuffer: Buffer.from("receipt"), ip: "1.2.3.4" })).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("wraps invalid images in ImageError", async () => {
    preprocessImageMock.mockRejectedValue(new ImageValidationError("BAD_MAGIC", "bad image"));
    const { ImageError, runScan } = await import("@/server/scan/orchestrator");

    await expect(runScan({ imageBuffer: Buffer.from("receipt"), ip: "1.2.3.4" })).rejects.toBeInstanceOf(ImageError);
  });

  it("throws OcrError and emits scan.failed when all providers fail", async () => {
    const events: unknown[] = [];
    runOcrMock.mockResolvedValue({
      runs: [
        { provider: "openai", model: "gpt-4o", ok: false, error: "boom", cached: false, latencyMs: 10 },
        { provider: "google", model: "gemini-1.5-flash", ok: false, error: "nope", cached: false, latencyMs: 11 },
      ],
      totalLatencyMs: 20,
      totalCostUsd: 0,
      modelSetKey: "google:gemini-1.5-flash,openai:gpt-4o",
    });
    const { OcrError, runScan } = await import("@/server/scan/orchestrator");

    await expect(runScan({ imageBuffer: Buffer.from("receipt"), ip: "1.2.3.4", onEvent: (event) => events.push(event) })).rejects.toBeInstanceOf(OcrError);
    expect(events).toContainEqual(expect.objectContaining({ type: "scan.failed", reason: "All OCR providers failed" }));
  });

  it("returns votingMismatch=true without blocking", async () => {
    voteOcrMock.mockReturnValue(votedBill({ subtotalMismatch: true }));
    const { runScan } = await import("@/server/scan/orchestrator");

    const result = await runScan({ imageBuffer: Buffer.from("receipt"), ip: "1.2.3.4" });

    expect(result.votingMismatch).toBe(true);
  });

  it("rescans an existing bill without creating a new bill", async () => {
    const { runScan } = await import("@/server/scan/orchestrator");

    const result = await runScan({ imageBuffer: Buffer.from("receipt"), ip: "1.2.3.4", billId: "bill-1" });

    expect(createBillMock).not.toHaveBeenCalled();
    expect(prismaBillFindUniqueMock).toHaveBeenCalledWith({
      where: { id: "bill-1" },
      include: { items: { orderBy: { position: "asc" } } },
    });
    expect(retryConsumeMock).toHaveBeenCalledWith("bill-1");
    expect(result.hostToken).toBeUndefined();
  });
});
