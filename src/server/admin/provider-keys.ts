import { prisma } from "@/lib/prisma";
import {
  decryptString,
  encryptString,
  parseBlob,
  serializeBlob,
  SecretsDecryptError,
} from "@/server/admin/secrets";
import type { ProviderId } from "@/server/ocr/providers";

const PROVIDERS: ProviderId[] = ["openai", "anthropic", "google"];

const settingKey = (provider: ProviderId): string => `provider_key:${provider}`;

const envApiKey = (provider: ProviderId): string | undefined => {
  if (provider === "openai") return process.env.OPENAI_API_KEY;
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY;
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY;
};

export type KeySource = "db" | "env" | "none" | "error";

export type ProviderKeyStatus = {
  source: KeySource;
  last4: string | null;
};

export type ResolvedProviderKey =
  | { source: "db" | "env"; apiKey: string }
  | { source: "none" }
  | { source: "error" };

const last4 = (value: string): string => value.slice(-4);

export function listProviders(): ProviderId[] {
  return [...PROVIDERS];
}

export async function getProviderKeyStatus(provider: ProviderId): Promise<ProviderKeyStatus> {
  const setting = await prisma.adminSetting.findUnique({ where: { key: settingKey(provider) } });
  if (setting) {
    const blob = parseBlob(setting.value);
    if (!blob) return { source: "error", last4: null };
    try {
      const plain = await decryptString(blob, settingKey(provider));
      return { source: "db", last4: last4(plain) };
    } catch (err) {
      if (err instanceof SecretsDecryptError) return { source: "error", last4: null };
      throw err;
    }
  }
  if (envApiKey(provider)) return { source: "env", last4: null };
  return { source: "none", last4: null };
}

export async function getAllProviderKeyStatus(): Promise<Record<ProviderId, ProviderKeyStatus>> {
  const entries = await Promise.all(
    PROVIDERS.map(async (p) => [p, await getProviderKeyStatus(p)] as const),
  );
  return Object.fromEntries(entries) as Record<ProviderId, ProviderKeyStatus>;
}

export async function resolveProviderApiKey(provider: ProviderId): Promise<ResolvedProviderKey> {
  const setting = await prisma.adminSetting.findUnique({ where: { key: settingKey(provider) } });
  if (setting) {
    const blob = parseBlob(setting.value);
    if (!blob) return { source: "error" };
    try {
      const apiKey = await decryptString(blob, settingKey(provider));
      return { source: "db", apiKey };
    } catch (err) {
      if (err instanceof SecretsDecryptError) return { source: "error" };
      throw err;
    }
  }
  const fromEnv = envApiKey(provider);
  if (fromEnv) return { source: "env", apiKey: fromEnv };
  return { source: "none" };
}

export async function setProviderApiKey(provider: ProviderId, apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error("api_key_required");
  const blob = await encryptString(trimmed, settingKey(provider));
  const value = serializeBlob(blob);
  await prisma.adminSetting.upsert({
    where: { key: settingKey(provider) },
    create: { key: settingKey(provider), value },
    update: { value },
  });
}

export async function clearProviderApiKey(provider: ProviderId): Promise<void> {
  await prisma.adminSetting
    .delete({ where: { key: settingKey(provider) } })
    .catch((err: unknown) => {
      const code = (err as { code?: string }).code;
      if (code === "P2025") return;
      throw err;
    });
}
