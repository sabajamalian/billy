import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PreprocessedImage } from "@/server/ocr/preprocess";
import type { OcrParseRaw } from "@/server/ocr/schema";

const generateObjectMock = vi.fn();
const ocrRunMock = {
  create: vi.fn().mockResolvedValue({}),
  findFirst: vi.fn().mockResolvedValue(null),
};
const adminSettingMock = {
  findUnique: vi.fn().mockResolvedValue(null),
};

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateObject: generateObjectMock };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { ocrRun: ocrRunMock, adminSetting: adminSettingMock },
}));

const validRaw: OcrParseRaw = {
  items: [{ name: "Burger", quantity: 1, unit_price_cents: 1299 }],
  tax_cents: 100,
  tip_cents: 200,
  subtotal_cents: 1299,
  total_cents: 1599,
  currency: "USD",
};

const image: PreprocessedImage = {
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
  mimeType: "image/jpeg",
  imageHash: "abc123",
  width: 100,
  height: 100,
  originalBytes: 4,
};

describe("OCR providers", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("OPENAI_API_KEY", "sk-test-openai");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-anthropic");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "g-test");
    vi.clearAllMocks();
    ocrRunMock.create.mockResolvedValue({});
    ocrRunMock.findFirst.mockResolvedValue(null);
    adminSettingMock.findUnique.mockResolvedValue(null);
    generateObjectMock.mockResolvedValue({
      object: validRaw,
      usage: { inputTokens: 1000, outputTokens: 100, inputTokenDetails: {}, outputTokenDetails: {}, totalTokens: 1100 },
    });
  });

  it("parses configured models from env", async () => {
    vi.stubEnv("BILLY_OCR_MODELS", "openai:gpt-4o,anthropic:claude-3-5-sonnet-20241022");
    const { getConfiguredModels } = await import("@/server/ocr/providers");

    expect(getConfiguredModels()).toEqual([
      { provider: "openai", model: "gpt-4o" },
      { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
    ]);
  });

  it("skips invalid configured model entries", async () => {
    vi.stubEnv("BILLY_OCR_MODELS", "openai:gpt-4o,bad:model,anthropic:,google:gemini-1.5-flash");
    const { getConfiguredModels } = await import("@/server/ocr/providers");

    expect(getConfiguredModels()).toEqual([
      { provider: "openai", model: "gpt-4o" },
      { provider: "google", model: "gemini-1.5-flash" },
    ]);
  });

  it("builds an order-stable active model set key", async () => {
    const { activeModelSetKey } = await import("@/server/ocr/providers");
    const forward = activeModelSetKey([
      { provider: "openai", model: "gpt-4o" },
      { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
      { provider: "google", model: "gemini-1.5-pro" },
    ]);
    const reverse = activeModelSetKey([
      { provider: "google", model: "gemini-1.5-pro" },
      { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
      { provider: "openai", model: "gpt-4o" },
    ]);

    expect(forward).toBe(reverse);
  });

  it("runs all configured models successfully", async () => {
    const { runOcr } = await import("@/server/ocr/providers");

    const result = await runOcr({
      billId: "bill-1",
      image,
      models: [
        { provider: "openai", model: "gpt-4o" },
        { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
      ],
    });

    expect(result.runs).toHaveLength(2);
    expect(result.runs.every((run) => run.ok && run.result?.items[0]?.unitPriceCents === 1299)).toBe(true);
    expect(ocrRunMock.create).toHaveBeenCalledTimes(2);
  });

  it("returns partial failures without failing the full OCR run", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: validRaw, usage: undefined }).mockRejectedValueOnce(new Error("boom"));
    const { runOcr } = await import("@/server/ocr/providers");

    const result = await runOcr({
      billId: "bill-1",
      image,
      models: [
        { provider: "openai", model: "gpt-4o" },
        { provider: "google", model: "gemini-1.5-flash" },
      ],
    });

    expect(result.runs.filter((run) => run.ok)).toHaveLength(1);
    expect(result.runs.filter((run) => !run.ok)).toHaveLength(1);
    expect(result.runs.find((run) => !run.ok)?.error).toContain("boom");
  });

  it("reuses cached raw results and skips the provider call", async () => {
    ocrRunMock.findFirst.mockResolvedValueOnce({ rawJson: JSON.stringify(validRaw), latencyMs: 123, costUsd: 0.01 });
    const { runOcr } = await import("@/server/ocr/providers");

    const result = await runOcr({
      billId: "bill-1",
      image,
      models: [{ provider: "openai", model: "gpt-4o" }],
    });

    expect(result.runs[0]).toMatchObject({ ok: true, cached: true });
    expect(generateObjectMock).not.toHaveBeenCalled();
    expect(ocrRunMock.create).not.toHaveBeenCalled();
  });

  it("returns an error on schema validation failure", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: { items: [{ name: "", quantity: 0 }] }, usage: undefined });
    const { runOcr } = await import("@/server/ocr/providers");

    const result = await runOcr({
      billId: "bill-1",
      image,
      models: [{ provider: "openai", model: "gpt-4o" }],
    });

    expect(result.runs[0]?.ok).toBe(false);
    expect(result.runs[0]?.error).toMatch(/schema|validation|too small|Invalid/i);
  });

  it("returns abort errors per model when aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("aborted by caller"));
    generateObjectMock.mockImplementationOnce(({ abortSignal }: { abortSignal: AbortSignal }) => {
      throw abortSignal.reason;
    });
    const { runOcr } = await import("@/server/ocr/providers");

    const result = await runOcr({
      billId: "bill-1",
      image,
      models: [{ provider: "openai", model: "gpt-4o" }],
      signal: controller.signal,
    });

    expect(result.runs[0]?.ok).toBe(false);
    expect(result.runs[0]?.error).toContain("aborted by caller");
  });
});
