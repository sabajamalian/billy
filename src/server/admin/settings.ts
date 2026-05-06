import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getConfiguredModels, type ConfiguredModel, type ProviderId } from "@/server/ocr/providers";

const MODELS_KEY = "models";
const QUORUM_KEY = "quorumOverride";
const PROVIDERS = new Set<ProviderId>(["openai", "anthropic", "google"]);

const parseModels = (value: string | undefined): ConfiguredModel[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const { provider, model } = entry as { provider?: unknown; model?: unknown };
      if (typeof provider !== "string" || typeof model !== "string") return [];
      if (!PROVIDERS.has(provider as ProviderId) || !model.trim()) return [];
      return [{ provider: provider as ProviderId, model: model.trim() }];
    });
  } catch {
    return [];
  }
};

export async function getActiveModels(): Promise<ConfiguredModel[]> {
  const setting = await prisma.adminSetting.findUnique({ where: { key: MODELS_KEY } });
  const models = parseModels(setting?.value);
  return models.length > 0 ? models : getConfiguredModels();
}

export async function setActiveModels(models: ConfiguredModel[]): Promise<ConfiguredModel[]> {
  const normalized = parseModels(JSON.stringify(models));
  await prisma.adminSetting.upsert({
    where: { key: MODELS_KEY },
    update: { value: JSON.stringify(normalized) },
    create: { key: MODELS_KEY, value: JSON.stringify(normalized) },
  });
  return normalized;
}

const parseQuorum = (value: string): number | null => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null) return null;
    if (typeof parsed === "number" && Number.isInteger(parsed) && parsed > 0) return parsed;
  } catch {
    return null;
  }
  return null;
};

export async function getQuorumOverride(): Promise<number | null> {
  const setting = await prisma.adminSetting.findUnique({ where: { key: QUORUM_KEY } });
  if (setting) return parseQuorum(setting.value);
  return env.BILLY_VOTING_QUORUM ?? null;
}

export async function setQuorumOverride(value: number | null): Promise<number | null> {
  const normalized = typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
  await prisma.adminSetting.upsert({
    where: { key: QUORUM_KEY },
    update: { value: JSON.stringify(normalized) },
    create: { key: QUORUM_KEY, value: JSON.stringify(normalized) },
  });
  return normalized;
}
