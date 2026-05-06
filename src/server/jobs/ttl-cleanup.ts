import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";

export type CleanupResult = {
  deletedBills: number;
  deletedFiles: number;
  fileErrors: number;
  scannedAt: Date;
};

const isEnoent = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const serializeError = (error: unknown) =>
  error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };

export async function runTtlCleanup(now: Date = new Date()): Promise<CleanupResult> {
  const result: CleanupResult = {
    deletedBills: 0,
    deletedFiles: 0,
    fileErrors: 0,
    scannedAt: now,
  };

  const expiredBills = await prisma.bill.findMany({
    where: { expiresAt: { lt: now } },
    select: { id: true, imagePath: true },
  });

  for (const bill of expiredBills) {
    try {
      if (bill.imagePath) {
        try {
          await fs.unlink(path.normalize(bill.imagePath));
          result.deletedFiles += 1;
        } catch (error) {
          if (isEnoent(error)) {
            result.deletedFiles += 1;
          } else {
            result.fileErrors += 1;
            console.warn(
              "[ttl-cleanup]",
              JSON.stringify({
                billId: bill.id,
                imagePath: bill.imagePath,
                error: serializeError(error),
              }),
            );
          }
        }
      }

      await prisma.bill.delete({ where: { id: bill.id } });
      result.deletedBills += 1;
    } catch (error) {
      console.warn(
        "[ttl-cleanup]",
        JSON.stringify({
          billId: bill.id,
          error: serializeError(error),
        }),
      );
    }
  }

  console.info("[ttl-cleanup]", JSON.stringify(result));
  return result;
}
