import { beforeEach, describe, expect, it, vi } from "vitest";
import { runTtlCleanup } from "./ttl-cleanup";

type ExpiredBill = { id: string; imagePath: string | null };
type DeleteArgs = { where: { id: string } };

const mocks = vi.hoisted(() => ({
  findMany: vi.fn<() => Promise<ExpiredBill[]>>(),
  deleteBill: vi.fn<(args: DeleteArgs) => Promise<unknown>>(),
  unlink: vi.fn<(filePath: string) => Promise<void>>(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bill: {
      findMany: mocks.findMany,
      delete: mocks.deleteBill,
    },
  },
}));

vi.mock("node:fs", () => ({
  default: {
    promises: {
      unlink: mocks.unlink,
    },
  },
  promises: {
    unlink: mocks.unlink,
  },
}));

const now = new Date("2026-05-06T12:00:00.000Z");

const bill = (id: string, imagePath: string | null = null) => ({ id, imagePath });

describe("runTtlCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.findMany.mockResolvedValue([]);
    mocks.deleteBill.mockResolvedValue({ id: "deleted" });
    mocks.unlink.mockResolvedValue(undefined);
  });

  it("returns zero counts when there are no expired bills", async () => {
    const result = await runTtlCleanup(now);

    expect(result).toMatchObject({ deletedBills: 0, deletedFiles: 0, fileErrors: 0 });
    expect(result.scannedAt).toBe(now);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
      select: { id: true, imagePath: true },
    });
    expect(mocks.deleteBill).not.toHaveBeenCalled();
    expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it("deletes one expired bill without an image", async () => {
    mocks.findMany.mockResolvedValue([bill("bill-1")]);

    const result = await runTtlCleanup(now);

    expect(result).toMatchObject({ deletedBills: 1, deletedFiles: 0, fileErrors: 0 });
    expect(mocks.unlink).not.toHaveBeenCalled();
    expect(mocks.deleteBill).toHaveBeenCalledWith({ where: { id: "bill-1" } });
  });

  it("deletes three expired bills with images", async () => {
    mocks.findMany.mockResolvedValue([
      bill("bill-1", "data/uploads/1.jpg"),
      bill("bill-2", "data/uploads/2.jpg"),
      bill("bill-3", "data/uploads/3.jpg"),
    ]);

    const result = await runTtlCleanup(now);

    expect(result).toMatchObject({ deletedBills: 3, deletedFiles: 3, fileErrors: 0 });
    expect(mocks.unlink).toHaveBeenCalledTimes(3);
    expect(mocks.deleteBill).toHaveBeenCalledTimes(3);
  });

  it("counts missing image files as deleted and still deletes the bill", async () => {
    const enoent = Object.assign(new Error("missing"), { code: "ENOENT" });
    mocks.findMany.mockResolvedValue([bill("bill-1", "data/uploads/missing.jpg")]);
    mocks.unlink.mockRejectedValue(enoent);

    const result = await runTtlCleanup(now);

    expect(result).toMatchObject({ deletedBills: 1, deletedFiles: 1, fileErrors: 0 });
    expect(mocks.deleteBill).toHaveBeenCalledWith({ where: { id: "bill-1" } });
  });

  it("counts image unlink permission errors but still deletes the bill", async () => {
    const eacces = Object.assign(new Error("permission denied"), { code: "EACCES" });
    mocks.findMany.mockResolvedValue([bill("bill-1", "data/uploads/locked.jpg")]);
    mocks.unlink.mockRejectedValue(eacces);

    const result = await runTtlCleanup(now);

    expect(result).toMatchObject({ deletedBills: 1, deletedFiles: 0, fileErrors: 1 });
    expect(mocks.deleteBill).toHaveBeenCalledWith({ where: { id: "bill-1" } });
  });

  it("continues when a bill delete fails and does not count that bill as deleted", async () => {
    mocks.findMany.mockResolvedValue([bill("bill-1"), bill("bill-2")]);
    mocks.deleteBill.mockImplementation(async ({ where }) => {
      if (where.id === "bill-1") throw new Error("delete failed");
      return { id: where.id };
    });

    const result = await runTtlCleanup(now);

    expect(result).toMatchObject({ deletedBills: 1, deletedFiles: 0, fileErrors: 0 });
    expect(mocks.deleteBill).toHaveBeenCalledTimes(2);
  });

  it("handles a mixed pass with two ok bills and one broken bill", async () => {
    mocks.findMany.mockResolvedValue([
      bill("bill-1", "data/uploads/1.jpg"),
      bill("bill-2", "data/uploads/2.jpg"),
      bill("bill-3", "data/uploads/3.jpg"),
    ]);
    mocks.deleteBill.mockImplementation(async ({ where }) => {
      if (where.id === "bill-2") throw new Error("delete failed");
      return { id: where.id };
    });

    const result = await runTtlCleanup(now);

    expect(result).toMatchObject({ deletedBills: 2, deletedFiles: 3, fileErrors: 0 });
    expect(mocks.deleteBill).toHaveBeenCalledTimes(3);
  });
});
