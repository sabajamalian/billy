import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { ensureAdmin } from "@/server/admin/http";
import { getActiveModels, getQuorumOverride, setActiveModels, setQuorumOverride } from "@/server/admin/settings";
import { PRICING_PER_MTOKEN_USD, type ConfiguredModel, type ProviderId } from "@/server/ocr/providers";

export const dynamic = "force-dynamic";

const providerKeysPresent = () => ({
  openai: Boolean(env.OPENAI_API_KEY),
  anthropic: Boolean(env.ANTHROPIC_API_KEY),
  google: Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY),
});

const providers = new Set<ProviderId>(["openai", "anthropic", "google"]);

const parseModels = (value: unknown): ConfiguredModel[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("activeModels must be an array");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("activeModels entries must be objects");
    const { provider, model } = entry as { provider?: unknown; model?: unknown };
    if (typeof provider !== "string" || typeof model !== "string") throw new Error("invalid model entry");
    if (!providers.has(provider as ProviderId) || !model.trim()) throw new Error("invalid model entry");
    return { provider: provider as ProviderId, model: model.trim() };
  });
};

const payload = async () => ({
  activeModels: await getActiveModels(),
  availableModels: Object.keys(PRICING_PER_MTOKEN_USD),
  quorumOverride: await getQuorumOverride(),
  providerKeysPresent: providerKeysPresent(),
});

export async function GET() {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;
  return NextResponse.json(await payload());
}

export async function PATCH(req: Request) {
  const unauthorized = await ensureAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = (await req.json().catch(() => ({}))) as { activeModels?: unknown; quorumOverride?: unknown };
    const models = parseModels(body.activeModels);
    if (models !== undefined) await setActiveModels(models);

    if (body.quorumOverride !== undefined) {
      const quorum = body.quorumOverride;
      if (quorum !== null && (typeof quorum !== "number" || !Number.isInteger(quorum) || quorum <= 0)) {
        return NextResponse.json({ error: "invalid_quorum" }, { status: 400 });
      }
      await setQuorumOverride(quorum);
    }

    return NextResponse.json(await payload());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", detail: err instanceof Error ? err.message : "bad request" },
      { status: 400 },
    );
  }
}
