import { beforeEach, describe, expect, it, vi } from "vitest";

const loadLimiter = async (ipLimit = 2, retryLimit = 2) => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "file:./data/test.db");
  vi.stubEnv("BILLY_PER_IP_SCAN_LIMIT", String(ipLimit));
  vi.stubEnv("BILLY_PER_BILL_RETRY_LIMIT", String(retryLimit));
  const mod = await import("@/server/limits/rate-limit");
  mod.ipScanLimit._reset();
  mod.billRetryLimit._reset();
  return mod;
};

describe("rate limits", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    delete globalThis.__billyRateLimit;
  });

  it("allows a new IP to scan up to the limit", async () => {
    const { ipScanLimit } = await loadLimiter(2);

    expect(ipScanLimit.check("1.2.3.4")).toEqual({ allowed: true });
    ipScanLimit.consume("1.2.3.4");
    expect(ipScanLimit.check("1.2.3.4")).toEqual({ allowed: true });
    ipScanLimit.consume("1.2.3.4");
  });

  it("blocks the limit+1th IP scan with retryAfterSeconds", async () => {
    const { ipScanLimit } = await loadLimiter(2);

    ipScanLimit.consume("1.2.3.4");
    ipScanLimit.consume("1.2.3.4");

    const result = ipScanLimit.check("1.2.3.4");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("allows an IP again after the 24h window expires", async () => {
    const now = new Date("2026-05-06T00:00:00Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const { ipScanLimit } = await loadLimiter(1);

    ipScanLimit.consume("1.2.3.4");
    expect(ipScanLimit.check("1.2.3.4").allowed).toBe(false);

    vi.mocked(Date.now).mockReturnValue(now + 24 * 60 * 60 * 1000 + 1);
    expect(ipScanLimit.check("1.2.3.4")).toEqual({ allowed: true });
  });

  it("isolates different IPs", async () => {
    const { ipScanLimit } = await loadLimiter(1);

    ipScanLimit.consume("1.2.3.4");

    expect(ipScanLimit.check("1.2.3.4").allowed).toBe(false);
    expect(ipScanLimit.check("5.6.7.8")).toEqual({ allowed: true });
  });

  it("limits retries per bill and reset allows again", async () => {
    const { billRetryLimit } = await loadLimiter(2, 2);

    billRetryLimit.consume("bill-1");
    billRetryLimit.consume("bill-1");
    expect(billRetryLimit.check("bill-1").allowed).toBe(false);

    billRetryLimit._reset();
    expect(billRetryLimit.check("bill-1")).toEqual({ allowed: true });
  });
});
