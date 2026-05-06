import { NextResponse } from "next/server";
import {
  createBill,
  replaceItems,
  updateBillSummary,
} from "@/server/billing/bill-service";
import { setHostTokenCookie } from "@/lib/cookies";
import { createBillSchema } from "@/lib/validation";
import { billToDto } from "@/lib/dto";

export const dynamic = "force-dynamic";

/**
 * POST /api/bills
 *
 * Creates a new bill. Body is optional — if items/tax/tip are provided, they're
 * applied immediately (manual entry path). Otherwise an empty bill is returned
 * (scan path; client uploads image next).
 *
 * Sets the host-token cookie on the creator's browser.
 */
export async function POST(req: Request) {
  let parsed;
  try {
    const json = await req.json().catch(() => ({}));
    parsed = createBillSchema.parse(json ?? {});
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", detail: err instanceof Error ? err.message : "bad request" },
      { status: 400 },
    );
  }

  const created = await createBill();
  await setHostTokenCookie(created.bill.id, created.hostToken, created.bill.expiresAt);

  let bill = created.bill;

  if (parsed.items && parsed.items.length > 0) {
    bill = await replaceItems(bill, parsed.items);
  }

  if (parsed.taxCents !== undefined || parsed.tip || parsed.currency || parsed.status) {
    bill = await updateBillSummary(bill, {
      taxCents: parsed.taxCents,
      tip: parsed.tip,
      currency: parsed.currency,
      status: parsed.status,
    });
  }

  return NextResponse.json(
    {
      bill: billToDto(bill),
      shareToken: created.shareToken,
    },
    { status: 201 },
  );
}
