import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1),

  // LLM provider keys (all optional — admin can toggle which to use)
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),

  // Comma-separated list of enabled provider:model pairs (e.g. "openai:gpt-4o,anthropic:claude-sonnet-4-5")
  // Empty/unset means OCR is unavailable; the admin panel can override at runtime.
  BILLY_OCR_MODELS: z.string().optional(),

  // Admin gate. If unset, /admin is disabled.
  ADMIN_PASSWORD: z.string().min(8).optional(),

  // Cost guardrail (USD). Soft cap per UTC day. 0 disables.
  BILLY_DAILY_LLM_COST_USD: z.coerce.number().nonnegative().default(50),

  // Per-IP scan budget per UTC day.
  BILLY_PER_IP_SCAN_LIMIT: z.coerce.number().int().nonnegative().default(20),

  // Per-bill OCR retry cap.
  BILLY_PER_BILL_RETRY_LIMIT: z.coerce.number().int().nonnegative().default(3),

  // Bill TTL in days.
  BILLY_BILL_TTL_DAYS: z.coerce.number().int().positive().default(7),

  // Voting quorum override; if unset we use ceil(N/2).
  BILLY_VOTING_QUORUM: z.coerce.number().int().positive().optional(),

  // Subtotal-vs-items reconciliation tolerance, expressed in cents OR fraction (whichever larger wins).
  BILLY_SUBTOTAL_TOLERANCE_CENTS: z.coerce.number().int().nonnegative().default(50),
  BILLY_SUBTOTAL_TOLERANCE_FRACTION: z.coerce.number().nonnegative().default(0.01),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;

export const isAdminEnabled = () => Boolean(env.ADMIN_PASSWORD);
