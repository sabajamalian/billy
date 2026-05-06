import { NextResponse } from "next/server";

import { getActiveBill, verifyHost } from "@/server/billing/bill-service";
import {
  BudgetExceededError,
  ImageError,
  OcrError,
  RateLimitError,
  RetryLimitError,
  runScan,
  type ScanEvent,
} from "@/server/scan/orchestrator";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ shareToken: string }> };

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const clientIp = (request: Request) => request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

const parseImage = async (request: Request): Promise<Buffer> => {
  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof Blob)) throw new ImageError("Missing receipt image");
  if (!image.type.startsWith("image/")) throw new ImageError("Receipt upload must be an image");
  if (image.size > MAX_IMAGE_BYTES) throw new ImageError("Receipt image must be 8MB or smaller");

  return Buffer.from(await image.arrayBuffer());
};

export async function POST(request: Request, ctx: RouteContext) {
  const { shareToken } = await ctx.params;
  try {
    const bill = await getActiveBill(shareToken);
    if (!(await verifyHost(bill))) {
      return NextResponse.json({ error: "forbidden", detail: "Host token required" }, { status: 403 });
    }

    if (request.headers.get("accept")?.includes("text/event-stream")) {
      return streamRescan(request, bill.id);
    }

    const result = await runScan({ imageBuffer: await parseImage(request), ip: clientIp(request), billId: bill.id });
    return NextResponse.json({ shareToken: result.shareToken, billId: result.billId });
  } catch (err) {
    return errorResponse(err);
  }
}

function streamRescan(request: Request, billId: string): Response {
  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, event: ScanEvent | { type: "error"; status: number; message: string }) => {
    controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          await runScan({
            imageBuffer: await parseImage(request),
            ip: clientIp(request),
            billId,
            onEvent: (event) => send(controller, event),
          });
        } catch (err) {
          send(controller, { type: "error", status: statusForError(err), message: messageForError(err) });
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function statusForError(err: unknown): number {
  if (err instanceof RateLimitError || err instanceof BudgetExceededError || err instanceof RetryLimitError) return 429;
  if (err instanceof ImageError) return 400;
  if (err instanceof OcrError) return 502;
  if (err instanceof Error && (err.name === "BillNotFoundError" || err.message === "Bill not found")) return 404;
  if (err instanceof Error && err.name === "BillExpiredError") return 410;
  return 500;
}

function messageForError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Scan failed";
}

function errorResponse(err: unknown): NextResponse {
  const body: { error: string; detail?: string; retryAfterSeconds?: number } = {
    error: err instanceof Error && "code" in err ? String(err.code) : "internal_error",
    detail: messageForError(err),
  };
  if ((err instanceof RateLimitError || err instanceof RetryLimitError) && err.retryAfterSeconds > 0) {
    body.retryAfterSeconds = err.retryAfterSeconds;
  }
  return NextResponse.json(body, { status: statusForError(err) });
}
