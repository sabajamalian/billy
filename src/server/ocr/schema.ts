import { z } from "zod";

export type { OcrParseResult } from "@/server/ocr/voting";
import type { OcrParseResult } from "@/server/ocr/voting";

export const ocrParseSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        quantity: z.number().int().min(1).max(99),
        unit_price_cents: z.number().int().min(-1_000_000).max(10_000_000),
      }),
    )
    .min(0)
    .max(200),
  tax_cents: z.number().int().min(0).max(10_000_000),
  tip_cents: z.number().int().min(0).max(10_000_000),
  subtotal_cents: z.number().int().min(0).max(10_000_000),
  total_cents: z.number().int().min(0).max(10_000_000),
  currency: z.string().min(3).max(8),
});

export type OcrParseRaw = z.infer<typeof ocrParseSchema>;

export const toOcrParseResult = (raw: OcrParseRaw): OcrParseResult => ({
  items: raw.items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unitPriceCents: item.unit_price_cents,
  })),
  taxCents: raw.tax_cents,
  tipCents: raw.tip_cents,
  subtotalCents: raw.subtotal_cents,
  totalCents: raw.total_cents,
  currency: raw.currency,
});
