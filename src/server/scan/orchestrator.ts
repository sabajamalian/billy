import { setHostTokenCookie } from "@/lib/cookies";
import { prisma } from "@/lib/prisma";
import { getActiveModels, getQuorumOverride } from "@/server/admin/settings";
import { createBill, replaceItems, updateBillSummary, type BillWithItems } from "@/server/billing/bill-service";
import { llmBudget } from "@/server/limits/budget";
import { billRetryLimit, ipScanLimit } from "@/server/limits/rate-limit";
import { ImageValidationError, preprocessImage } from "@/server/ocr/preprocess";
import { runOcr } from "@/server/ocr/providers";
import { voteOcr } from "@/server/ocr/voting";

export type ScanStartedEvent = { type: "scan.started"; modelCount: number };
export type ProviderProgressEvent = {
  type: "provider.done" | "provider.failed";
  provider: string;
  model: string;
  cached: boolean;
  latencyMs?: number;
  costUsd?: number;
  error?: string;
};
export type VotingDoneEvent = { type: "voting.done"; itemsCount: number; subtotalMismatch: boolean };
export type ScanCompleteEvent = { type: "scan.complete"; billShareToken: string; billId: string };
export type ScanFailedEvent = { type: "scan.failed"; reason: string };

export type ScanEvent = ScanStartedEvent | ProviderProgressEvent | VotingDoneEvent | ScanCompleteEvent | ScanFailedEvent;

export type RunScanArgs = {
  imageBuffer: Buffer;
  ip: string;
  billId?: string;
  onEvent?: (e: ScanEvent) => void;
};

export type RunScanResult = {
  shareToken: string;
  hostToken?: string;
  billId: string;
  billExpiresAt: Date;
  votingMismatch: boolean;
};

export class RateLimitError extends Error {
  code = "ip_limit" as const;
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Per-IP scan limit exceeded");
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class BudgetExceededError extends Error {
  code = "budget_exceeded" as const;

  constructor() {
    super("Daily LLM budget exceeded");
    this.name = "BudgetExceededError";
  }
}

export class RetryLimitError extends Error {
  code = "retry_limit" as const;
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Per-bill retry limit exceeded");
    this.name = "RetryLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ImageError extends Error {
  code = "image_invalid" as const;

  constructor(message: string) {
    super(message);
    this.name = "ImageError";
  }
}

export class OcrError extends Error {
  code = "ocr_failed" as const;

  constructor() {
    super("All OCR providers failed");
    this.name = "OcrError";
  }
}

const reasonFor = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const fetchBillById = async (billId: string): Promise<BillWithItems> => {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!bill) throw new Error("Bill not found");
  return bill;
};

export async function runScan(args: RunScanArgs): Promise<RunScanResult> {
  const emit = args.onEvent ?? (() => undefined);

  try {
    const ipLimit = ipScanLimit.check(args.ip);
    if (!ipLimit.allowed) throw new RateLimitError(ipLimit.retryAfterSeconds);

    const budget = llmBudget.check();
    if (!budget.allowed) throw new BudgetExceededError();

    const image = await preprocessImage(args.imageBuffer).catch((err: unknown) => {
      if (err instanceof ImageValidationError) throw new ImageError(err.message);
      throw err;
    });

    if (args.billId) {
      const retryLimit = billRetryLimit.check(args.billId);
      if (!retryLimit.allowed) throw new RetryLimitError(retryLimit.retryAfterSeconds);
    }

    const created = args.billId ? undefined : await createBill();
    if (created?.hostToken && process.env.NODE_ENV !== "test") {
      await setHostTokenCookie(created.bill.id, created.hostToken, created.bill.expiresAt);
    }
    let bill = args.billId ? await fetchBillById(args.billId) : created!.bill;
    const models = await getActiveModels();

    emit({ type: "scan.started", modelCount: models.length });
    const ocrResult = await runOcr({ billId: bill.id, image, models });

    for (const run of ocrResult.runs) {
      if (run.ok) {
        emit({
          type: "provider.done",
          provider: run.provider,
          model: run.model,
          cached: run.cached ?? false,
          latencyMs: run.latencyMs,
          costUsd: run.costUsd ?? undefined,
        });
      } else {
        emit({
          type: "provider.failed",
          provider: run.provider,
          model: run.model,
          cached: run.cached ?? false,
          latencyMs: run.latencyMs,
          costUsd: run.costUsd ?? undefined,
          error: run.error,
        });
      }
    }

    if (ocrResult.runs.every((run) => !run.ok)) throw new OcrError();

    const quorumOverride = await getQuorumOverride();
    const voted = voteOcr(ocrResult.runs, quorumOverride ? { quorum: () => quorumOverride } : undefined);
    emit({ type: "voting.done", itemsCount: voted.items.length, subtotalMismatch: voted.subtotalMismatch });

    bill = await replaceItems(bill, voted.items);
    bill = await updateBillSummary(bill, {
      taxCents: voted.taxCents,
      tip: { type: "FLAT", value: voted.tipCents },
      currency: ocrResult.runs.find((run) => run.ok)?.result?.currency,
    });

    ipScanLimit.consume(args.ip);
    if (args.billId) billRetryLimit.consume(args.billId);
    llmBudget.record(ocrResult.totalCostUsd);

    emit({ type: "scan.complete", billShareToken: bill.shareToken, billId: bill.id });

    return {
      shareToken: bill.shareToken,
      hostToken: created?.hostToken,
      billId: bill.id,
      billExpiresAt: bill.expiresAt,
      votingMismatch: voted.subtotalMismatch,
    };
  } catch (err) {
    emit({ type: "scan.failed", reason: reasonFor(err) });
    throw err;
  }
}
