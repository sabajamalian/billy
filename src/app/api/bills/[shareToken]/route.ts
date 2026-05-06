import { NextResponse } from "next/server";
import {
  BillAuthError,
  BillExpiredError,
  BillNotFoundError,
  getActiveBill,
  replaceItems,
  updateBillSummary,
  verifyHost,
} from "@/server/billing/bill-service";
import { billChannel } from "@/server/realtime/bill-channel";
import { patchBillSchema } from "@/lib/validation";
import { billToDto } from "@/lib/dto";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ shareToken: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  const { shareToken } = await ctx.params;
  try {
    const bill = await getActiveBill(shareToken);
    return NextResponse.json({
      bill: billToDto(bill),
      isHost: await verifyHost(bill),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const { shareToken } = await ctx.params;
  let parsed;
  try {
    const json = await req.json().catch(() => ({}));
    parsed = patchBillSchema.parse(json ?? {});
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", detail: err instanceof Error ? err.message : "bad request" },
      { status: 400 },
    );
  }

  try {
    let bill = await getActiveBill(shareToken);

    if (parsed.items !== undefined) {
      bill = await replaceItems(bill, parsed.items);
    }

    if (
      parsed.taxCents !== undefined ||
      parsed.tip ||
      parsed.currency ||
      parsed.status ||
      parsed.acceptedMismatch !== undefined
    ) {
      bill = await updateBillSummary(bill, {
        taxCents: parsed.taxCents,
        tip: parsed.tip,
        currency: parsed.currency,
        status: parsed.status,
        acceptedMismatch: parsed.acceptedMismatch,
      });
    }

    billChannel.publish(bill.id, {
      type: "bill.updated",
      billId: bill.id,
      version: bill.version,
      at: Date.now(),
    });

    return NextResponse.json({ bill: billToDto(bill) });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown): NextResponse {
  if (err instanceof BillNotFoundError) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (err instanceof BillExpiredError) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  if (err instanceof BillAuthError) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  console.error("[/api/bills/:shareToken]", err);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
