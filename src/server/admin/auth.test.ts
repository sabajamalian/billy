import { beforeEach, describe, expect, it, vi } from "vitest";

const loadAuth = async () => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "file:./data/test.db");
  vi.stubEnv("ADMIN_PASSWORD", "correct horse battery staple");
  return import("@/server/admin/auth");
};

describe("admin auth cookies", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("signs and verifies an admin cookie", async () => {
    const { signAdminCookie, verifyAdminCookie } = await loadAuth();
    const token = signAdminCookie(new Date("2026-05-06T12:00:00.000Z"));

    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-05-06T13:00:00.000Z").getTime());
    expect(verifyAdminCookie(token)).toBe(true);
  });

  it("rejects expired tokens", async () => {
    const { signAdminCookie, verifyAdminCookie } = await loadAuth();
    const token = signAdminCookie(new Date("2026-05-05T12:00:00.000Z"));

    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-05-06T12:00:01.000Z").getTime());
    expect(verifyAdminCookie(token)).toBe(false);
  });

  it("rejects tampered tokens", async () => {
    const { signAdminCookie, verifyAdminCookie } = await loadAuth();
    const token = signAdminCookie(new Date("2026-05-06T12:00:00.000Z"));
    const tampered = token.replace(/^./, token[0] === "a" ? "b" : "a");

    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-05-06T13:00:00.000Z").getTime());
    expect(verifyAdminCookie(tampered)).toBe(false);
  });
});
