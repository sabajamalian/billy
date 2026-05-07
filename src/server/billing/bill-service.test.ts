import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { bill: { create: mocks.createMock } },
}));

vi.mock("@/lib/cookies", () => ({
  readHostTokenCookie: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: { BILLY_BILL_TTL_DAYS: 7 },
}));

import { createBill } from "@/server/billing/bill-service";
import { Prisma } from "@/generated/prisma/client";

const collisionError = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["shareToken"] },
  });

const fakeBill = (shareToken: string) => ({
  id: "bill-id",
  shareToken,
  hostTokenHash: "hash",
  status: "SCANNING",
  imagePath: null,
  currency: "USD",
  taxCents: 0,
  tipInputType: "FLAT",
  tipInputValue: 0,
  tipResolvedCents: 0,
  acceptedMismatch: false,
  version: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  expiresAt: new Date(),
  items: [],
});

describe("createBill share-token collision handling", () => {
  beforeEach(() => {
    mocks.createMock.mockReset();
  });

  it("uses a length-4 token on first try when there is no collision", async () => {
    mocks.createMock.mockImplementationOnce(async ({ data }: { data: { shareToken: string } }) =>
      fakeBill(data.shareToken),
    );

    const result = await createBill();

    expect(result.shareToken).toHaveLength(4);
    expect(mocks.createMock).toHaveBeenCalledTimes(1);
  });

  it("retries at the same length on a single collision, still returning length-4", async () => {
    mocks.createMock
      .mockRejectedValueOnce(collisionError())
      .mockImplementationOnce(async ({ data }: { data: { shareToken: string } }) =>
        fakeBill(data.shareToken),
      );

    const result = await createBill();

    expect(result.shareToken).toHaveLength(4);
    expect(mocks.createMock).toHaveBeenCalledTimes(2);
  });

  it("bumps token length to 5 after 3 length-4 collisions", async () => {
    mocks.createMock
      .mockRejectedValueOnce(collisionError())
      .mockRejectedValueOnce(collisionError())
      .mockRejectedValueOnce(collisionError())
      .mockImplementationOnce(async ({ data }: { data: { shareToken: string } }) =>
        fakeBill(data.shareToken),
      );

    const result = await createBill();

    expect(result.shareToken).toHaveLength(5);
    expect(mocks.createMock).toHaveBeenCalledTimes(4);
    const lengths = mocks.createMock.mock.calls.map((c) => (c[0] as { data: { shareToken: string } }).data.shareToken.length);
    expect(lengths).toEqual([4, 4, 4, 5]);
  });

  it("re-throws non-collision errors immediately", async () => {
    const dbError = new Error("database is down");
    mocks.createMock.mockRejectedValueOnce(dbError);

    await expect(createBill()).rejects.toBe(dbError);
    expect(mocks.createMock).toHaveBeenCalledTimes(1);
  });
});
