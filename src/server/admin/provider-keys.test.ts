import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const settings = new Map<string, string>();
  return {
    settings,
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
      const value = settings.get(where.key);
      return value === undefined ? null : { key: where.key, value };
    }),
    upsert: vi.fn(async ({ where, update, create }: {
      where: { key: string };
      update: { value: string };
      create: { key: string; value: string };
    }) => {
      settings.set(where.key, update.value ?? create.value);
      return { key: where.key, value: settings.get(where.key)! };
    }),
    delete: vi.fn(async ({ where }: { where: { key: string } }) => {
      if (!settings.has(where.key)) {
        const error = new Error("not found") as Error & { code?: string };
        error.code = "P2025";
        throw error;
      }
      settings.delete(where.key);
      return { key: where.key, value: "" };
    }),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminSetting: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
      delete: mocks.delete,
    },
  },
}));

const TEST_HEX = "0".repeat(64);

const setupEnv = () => {
  const dir = mkdtempSync(join(tmpdir(), "billy-pkey-"));
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "billy.db")}`);
  vi.stubEnv("BILLY_KEY_ENCRYPTION_SECRET", TEST_HEX);
};

const loadModule = async () => {
  vi.resetModules();
  return import("@/server/admin/provider-keys");
};

describe("admin/provider-keys", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mocks.settings.clear();
    setupEnv();
  });

  it("returns 'none' when neither DB nor env has a key", async () => {
    const { getProviderKeyStatus } = await loadModule();
    await expect(getProviderKeyStatus("openai")).resolves.toEqual({ source: "none", last4: null });
  });

  it("returns 'env' (last4 omitted) when only env is set", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-env-1234567890abcdef");
    const { getProviderKeyStatus } = await loadModule();
    await expect(getProviderKeyStatus("openai")).resolves.toEqual({ source: "env", last4: null });
  });

  it("stores, retrieves with last4, and clears DB key", async () => {
    const { setProviderApiKey, getProviderKeyStatus, resolveProviderApiKey, clearProviderApiKey } = await loadModule();

    await setProviderApiKey("openai", "sk-test-abcdef-WXYZ");
    const status = await getProviderKeyStatus("openai");
    expect(status).toEqual({ source: "db", last4: "WXYZ" });

    const resolved = await resolveProviderApiKey("openai");
    expect(resolved).toEqual({ source: "db", apiKey: "sk-test-abcdef-WXYZ" });

    await clearProviderApiKey("openai");
    await expect(getProviderKeyStatus("openai")).resolves.toEqual({ source: "none", last4: null });
  });

  it("DB key takes precedence over env", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-env-9999");
    const { setProviderApiKey, resolveProviderApiKey } = await loadModule();
    await setProviderApiKey("openai", "sk-db-LAST");
    const resolved = await resolveProviderApiKey("openai");
    expect(resolved).toEqual({ source: "db", apiKey: "sk-db-LAST" });
  });

  it("rejects empty/whitespace keys", async () => {
    const { setProviderApiKey } = await loadModule();
    await expect(setProviderApiKey("openai", "   ")).rejects.toThrow(/api_key_required/);
  });

  it("falls back to env when DB row deleted", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-fallback");
    const { setProviderApiKey, clearProviderApiKey, resolveProviderApiKey } = await loadModule();

    await setProviderApiKey("anthropic", "sk-ant-db");
    expect(await resolveProviderApiKey("anthropic")).toEqual({ source: "db", apiKey: "sk-ant-db" });

    await clearProviderApiKey("anthropic");
    expect(await resolveProviderApiKey("anthropic")).toEqual({ source: "env", apiKey: "sk-ant-fallback" });
  });

  it("returns 'error' (no env fallback) when DB row exists but is undecryptable", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-env-should-not-leak");
    mocks.settings.set("provider_key:openai", JSON.stringify({ v: 1, iv: "AAAA", tag: "AAAA", ct: "AAAA" }));
    const { getProviderKeyStatus, resolveProviderApiKey } = await loadModule();

    await expect(getProviderKeyStatus("openai")).resolves.toEqual({ source: "error", last4: null });
    await expect(resolveProviderApiKey("openai")).resolves.toEqual({ source: "error" });
  });

  it("getAllProviderKeyStatus returns one entry per provider", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "g-env");
    const { setProviderApiKey, getAllProviderKeyStatus } = await loadModule();
    await setProviderApiKey("openai", "sk-XYZ-LAST4");

    const all = await getAllProviderKeyStatus();
    expect(all.openai).toEqual({ source: "db", last4: "AST4" });
    expect(all.google).toEqual({ source: "env", last4: null });
    expect(all.anthropic).toEqual({ source: "none", last4: null });
  });

  it("clearProviderApiKey is idempotent (P2025 swallowed)", async () => {
    const { clearProviderApiKey } = await loadModule();
    await expect(clearProviderApiKey("openai")).resolves.toBeUndefined();
  });
});
