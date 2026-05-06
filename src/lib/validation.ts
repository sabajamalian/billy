import { z } from "zod";

export const itemInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(200),
  unitPriceCents: z.number().int().min(-1_000_000).max(10_000_000),
  quantity: z.number().int().min(1).max(99),
  position: z.number().int().min(0).max(1000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  flagged: z.boolean().optional(),
});

export type ItemInputDto = z.infer<typeof itemInputSchema>;

export const tipInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PERCENT_PRE_TAX"), value: z.number().min(0).max(100) }),
  z.object({ type: z.literal("PERCENT_POST_TAX"), value: z.number().min(0).max(100) }),
  z.object({ type: z.literal("FLAT"), value: z.number().int().min(0).max(10_000_000) }),
  z.object({ type: z.literal("RECEIPT_GRATUITY"), value: z.number().min(0) }),
]);

export type TipInputDto = z.infer<typeof tipInputSchema>;

export const createBillSchema = z.object({
  items: z.array(itemInputSchema).max(200).optional(),
  taxCents: z.number().int().min(0).max(10_000_000).optional(),
  tip: tipInputSchema.optional(),
  currency: z.string().min(3).max(8).optional(),
  status: z.enum(["SCANNING", "READY"]).optional(),
});

export const patchBillSchema = z.object({
  items: z.array(itemInputSchema).max(200).optional(),
  taxCents: z.number().int().min(0).max(10_000_000).optional(),
  tip: tipInputSchema.optional(),
  currency: z.string().min(3).max(8).optional(),
  status: z.enum(["SCANNING", "READY"]).optional(),
  acceptedMismatch: z.boolean().optional(),
});

export type PatchBillDto = z.infer<typeof patchBillSchema>;
