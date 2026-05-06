import type { BillWithItems } from "@/server/billing/bill-service";

/** Public DTO shape returned to clients (no host secrets, no internal-only fields). */
export type BillDto = {
  id: string;
  shareToken: string;
  status: "SCANNING" | "READY";
  currency: string;
  taxCents: number;
  tipInputType: "PERCENT_PRE_TAX" | "PERCENT_POST_TAX" | "FLAT" | "RECEIPT_GRATUITY";
  tipInputValue: number;
  tipResolvedCents: number;
  acceptedMismatch: boolean;
  version: number;
  createdAt: string;
  expiresAt: string;
  items: {
    id: string;
    name: string;
    unitPriceCents: number;
    quantity: number;
    position: number;
    confidence: number;
    flagged: boolean;
  }[];
};

export function billToDto(bill: BillWithItems): BillDto {
  return {
    id: bill.id,
    shareToken: bill.shareToken,
    status: bill.status,
    currency: bill.currency,
    taxCents: bill.taxCents,
    tipInputType: bill.tipInputType as BillDto["tipInputType"],
    tipInputValue: bill.tipInputValue,
    tipResolvedCents: bill.tipResolvedCents,
    acceptedMismatch: bill.acceptedMismatch,
    version: bill.version,
    createdAt: bill.createdAt.toISOString(),
    expiresAt: bill.expiresAt.toISOString(),
    items: bill.items.map((it) => ({
      id: it.id,
      name: it.name,
      unitPriceCents: it.unitPriceCents,
      quantity: it.quantity,
      position: it.position,
      confidence: it.confidence,
      flagged: it.flagged,
    })),
  };
}
