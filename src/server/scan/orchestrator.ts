import { setHostTokenCookie } from "@/lib/cookies";
import { prisma } from "@/lib/prisma";
import { getActiveModels, getQuorumOverride } from "@/server/admin/settings";
import { createBill, replaceItems, updateBillSummary, type BillWithItems } from "@/server/billing/bill-service";
import { llmBudget } from "@/server/limits/budget";
import { billRetryLimit, ipScanLimit } from "@/server/limits/rate-limit";
import { ImageValidationError, preprocessImage, type PreprocessedImage } from "@/server/ocr/preprocess";
import { runOcr, type ConfiguredModel } from "@/server/ocr/providers";
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
export type ScanErrorType =
  | "rate_limited"
  | "budget_exhausted"
  | "retry_exhausted"
  | "image_error"
  | "no_models"
  | "internal";
export type ScanCompleteEvent = { type: "scan.complete"; billShareToken: string; billId: string };
export type ScanFailedEvent = { type: "scan.failed"; reason: string; errorType: ScanErrorType; retryAfterSeconds?: number };

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

export type ActiveModelEntry = ConfiguredModel;

/**
 * State produced by `prepareScan` (preflight + bill creation) and consumed by
 * `executeScan` (OCR + voting + save). Splitting the pipeline lets the route
 * handler create the bill synchronously and set the host cookie on the
 * outgoing streaming response BEFORE the stream begins emitting.
 */
export type PreparedScan = {
  bill: BillWithItems;
  hostToken?: string;
  image: PreprocessedImage;
  models: ActiveModelEntry[];
  isNewBill: boolean;
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

export class NoModelsConfiguredError extends Error {
  code = "no_models" as const;

  constructor() {
    super("No OCR models are configured");
    this.name = "NoModelsConfiguredError";
  }
}

const reasonFor = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function errorTypeForError(err: unknown): ScanErrorType {
  if (err instanceof RateLimitError) return "rate_limited";
  if (err instanceof BudgetExceededError) return "budget_exhausted";
  if (err instanceof RetryLimitError) return "retry_exhausted";
  if (err instanceof ImageError) return "image_error";
  if (err instanceof NoModelsConfiguredError) return "no_models";
  return "internal";
}

export function scanFailedEventForError(err: unknown): ScanFailedEvent {
  return {
    type: "scan.failed",
    reason: reasonFor(err),
    errorType: errorTypeForError(err),
    retryAfterSeconds: err instanceof RateLimitError || err instanceof RetryLimitError ? err.retryAfterSeconds : undefined,
  };
}

const fetchBillById = async (billId: string): Promise<BillWithItems> => {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!bill) throw new Error("Bill not found");
  return bill;
};

export type PrepareScanArgs = {
  imageBuffer: Buffer;
  ip: string;
  billId?: string;
};

/**
 * Preflight + bill creation. Runs all the validation that can fail before any
 * OCR provider is invoked, and creates the bill (assigning a host token) when
 * needed. For new bills, it also calls setHostTokenCookie so subsequent
 * server-internal `assertHost` checks succeed in the same request scope.
 */
export async function prepareScan(args: PrepareScanArgs): Promise<PreparedScan> {
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

  const models = await getActiveModels();
  if (models.length === 0) throw new NoModelsConfiguredError();

  if (args.billId) {
    const bill = await fetchBillById(args.billId);
    return { bill, image, models, isNewBill: false };
  }

  const created = await createBill();
  if (process.env.NODE_ENV !== "test") {
    // Mutates the request-side cookie store so server-internal assertHost()
    // calls during executeScan succeed. The browser-facing Set-Cookie is set
    // by the route handler on the outgoing response (see setHostTokenOnResponse).
    await setHostTokenCookie(created.bill.id, created.hostToken, created.bill.expiresAt);
  }
  return {
    bill: created.bill,
    hostToken: created.hostToken,
    image,
    models,
    isNewBill: true,
  };
}

export type ExecuteScanArgs = {
  prepared: PreparedScan;
  ip: string;
  onEvent?: (e: ScanEvent) => void;
};

/**
 * OCR + voting + save. Emits scan lifecycle events. Assumes the bill already
 * exists and that any cookie-based auth state needed by replaceItems /
 * updateBillSummary has been established by `prepareScan`.
 */
export async function executeScan(args: ExecuteScanArgs): Promise<RunScanResult> {
  const emit = args.onEvent ?? (() => undefined);
  const { prepared } = args;

  try {
    emit({ type: "scan.started", modelCount: prepared.models.length });
    const ocrResult = await runOcr({ billId: prepared.bill.id, image: prepared.image, models: prepared.models });

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

    let bill = await replaceItems(prepared.bill, voted.items);
    bill = await updateBillSummary(bill, {
      taxCents: voted.taxCents,
      tip: { type: "FLAT", value: voted.tipCents },
      currency: ocrResult.runs.find((run) => run.ok)?.result?.currency,
    });

    ipScanLimit.consume(args.ip);
    if (!prepared.isNewBill) billRetryLimit.consume(prepared.bill.id);
    llmBudget.record(ocrResult.totalCostUsd);

    emit({ type: "scan.complete", billShareToken: bill.shareToken, billId: bill.id });

    return {
      shareToken: bill.shareToken,
      hostToken: prepared.hostToken,
      billId: bill.id,
      billExpiresAt: bill.expiresAt,
      votingMismatch: voted.subtotalMismatch,
    };
  } catch (err) {
    emit(scanFailedEventForError(err));
    throw err;
  }
}

/**
 * Backwards-compatible composed entry point. Non-streaming callers and tests
 * use this. Streaming callers should use prepareScan + executeScan directly so
 * they can set the host cookie synchronously on the outgoing response before
 * the stream emits.
 */
export async function runScan(args: RunScanArgs): Promise<RunScanResult> {
  const emit = args.onEvent ?? (() => undefined);
  let prepared: PreparedScan;
  try {
    prepared = await prepareScan({ imageBuffer: args.imageBuffer, ip: args.ip, billId: args.billId });
  } catch (err) {
    emit(scanFailedEventForError(err));
    throw err;
  }
  return executeScan({ prepared, ip: args.ip, onEvent: args.onEvent });
}
