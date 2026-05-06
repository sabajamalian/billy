import { prisma } from "@/lib/prisma";
import type { OcrRun as PrismaOcrRun } from "@/generated/prisma/client";

export type CachedOcrRun = Pick<PrismaOcrRun, "rawJson" | "latencyMs" | "costUsd">;

export async function findCachedOcrRun(args: {
  imageHash: string;
  provider: string;
  model: string;
  maxAgeDays?: number;
}): Promise<CachedOcrRun | null> {
  const maxAgeDays = args.maxAgeDays ?? 30;
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

  return prisma.ocrRun.findFirst({
    where: {
      imageHash: args.imageHash,
      provider: args.provider,
      model: args.model,
      ok: true,
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: "desc" },
    select: {
      rawJson: true,
      latencyMs: true,
      costUsd: true,
    },
  });
}
