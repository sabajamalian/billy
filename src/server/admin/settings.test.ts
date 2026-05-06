import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const settings = new Map<string, string>();
  return {
    settings,
    getConfiguredModels: vi.fn(),
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
      const value = settings.get(where.key);
      return value === undefined ? null : { key: where.key, value };
    }),
    upsert: vi.fn(async ({ where, update, create }: { where: { key: string }; update: { value: string }; create: { key: string; value: string } }) => {
      settings.set(where.key, update.value ?? create.value);
      return { key: where.key, value: settings.get(where.key)! };
    }),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminSetting: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
    },
  },
}));

vi.mock("@/server/ocr/providers", () => ({
  getConfiguredModels: mocks.getConfiguredModels,
}));

const loadSettings = async () => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "file:./data/test.db");
  return import("@/server/admin/settings");
};

describe("admin settings", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mocks.settings.clear();
    mocks.getConfiguredModels.mockReturnValue([{ provider: "openai", model: "gpt-4o" }]);
  });

  it("falls back to env configured models when no admin setting exists", async () => {
    const { getActiveModels } = await loadSettings();

    await expect(getActiveModels()).resolves.toEqual([{ provider: "openai", model: "gpt-4o" }]);
  });

  it("overrides active models via setActiveModels", async () => {
    const { getActiveModels, setActiveModels } = await loadSettings();

    await setActiveModels([{ provider: "google", model: "gemini-1.5-flash" }]);

    await expect(getActiveModels()).resolves.toEqual([{ provider: "google", model: "gemini-1.5-flash" }]);
  });

  it("persists settings through Prisma upsert/read", async () => {
    const { getActiveModels, setActiveModels, getQuorumOverride, setQuorumOverride } = await loadSettings();

    await setActiveModels([{ provider: "anthropic", model: "claude-3-5-haiku-20241022" }]);
    await setQuorumOverride(2);

    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    await expect(getActiveModels()).resolves.toEqual([
      { provider: "anthropic", model: "claude-3-5-haiku-20241022" },
    ]);
    await expect(getQuorumOverride()).resolves.toBe(2);
  });
});
