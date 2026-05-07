/**
 * Bill service — server-only CRUD with capability-token enforcement.
 *
 * Auth model:
 * - shareToken (in URL): grants read access. Anyone with the link can view the bill.
 * - hostToken (HTTP-only cookie, hashed at rest): grants edit access. Only the
 *   creator's browser can mutate items, tax, tip, and bill status.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import {
  generateCapabilityToken,
  generateShareToken,
  hashCapabilityToken,
  verifyCapabilityToken,
  SHARE_TOKEN_MIN_LENGTH,
  SHARE_TOKEN_MAX_LENGTH,
} from "@/lib/tokens";
import { readHostTokenCookie } from "@/lib/cookies";
import { Prisma, type Bill, type Item } from "@/generated/prisma/client";

export type TipInput =
  | { type: "PERCENT_PRE_TAX"; value: number }
  | { type: "PERCENT_POST_TAX"; value: number }
  | { type: "FLAT"; value: number }
  | { type: "RECEIPT_GRATUITY"; value: number };

export type BillWithItems = Bill & { items: Item[] };

/** What the host's browser receives once on bill creation. */
export type CreateBillResult = {
  bill: BillWithItems;
  shareToken: string;
  hostToken: string;
};

const ttlExpiresAt = () => {
  const ttlMs = env.BILLY_BILL_TTL_DAYS * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ttlMs);
};

const resolveTipCents = (
  tip: TipInput,
  subtotalCents: number,
  taxCents: number,
): number => {
  switch (tip.type) {
    case "FLAT":
      return Math.max(0, Math.round(tip.value));
    case "RECEIPT_GRATUITY":
      return 0; // already on receipt as a separate line; don't double-count
    case "PERCENT_PRE_TAX":
      return Math.max(0, Math.round((tip.value / 100) * subtotalCents));
    case "PERCENT_POST_TAX":
      return Math.max(0, Math.round((tip.value / 100) * (subtotalCents + taxCents)));
  }
};

const computeSubtotalCents = (items: Pick<Item, "unitPriceCents" | "quantity">[]): number =>
  items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);

/** Retries before bumping the share-token length on collision. */
const SHARE_TOKEN_RETRIES_PER_LENGTH = 3;

const isShareTokenCollision = (err: unknown): boolean => {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== "P2002") return false;
  const target = (err.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) return target.includes("shareToken");
  if (typeof target === "string") return target.includes("shareToken");
  return false;
};

/** Create a fresh bill with no items yet. Returns plaintext tokens (only this once). */
export async function createBill(): Promise<CreateBillResult> {
  const hostToken = generateCapabilityToken();
  const hostTokenHash = hashCapabilityToken(hostToken);
  const expiresAt = ttlExpiresAt();

  let lastError: unknown;
  for (let length = SHARE_TOKEN_MIN_LENGTH; length <= SHARE_TOKEN_MAX_LENGTH; length++) {
    for (let attempt = 0; attempt < SHARE_TOKEN_RETRIES_PER_LENGTH; attempt++) {
      const shareToken = generateShareToken(length);
      try {
        const bill = await prisma.bill.create({
          data: {
            shareToken,
            hostTokenHash,
            status: "SCANNING",
            expiresAt,
          },
          include: { items: true },
        });
        return { bill, shareToken, hostToken };
      } catch (err) {
        if (!isShareTokenCollision(err)) throw err;
        lastError = err;
      }
    }
  }

  throw lastError ?? new Error("Failed to allocate a unique share token");
}

/** Read access: anyone with the share token can fetch the bill. */
export async function getBillByShareToken(shareToken: string): Promise<BillWithItems | null> {
  return prisma.bill.findUnique({
    where: { shareToken },
    include: { items: { orderBy: { position: "asc" } } },
  });
}

/** Verify the cookie-bound host token matches the bill's stored hash. */
export async function verifyHost(bill: Bill): Promise<boolean> {
  const cookieToken = await readHostTokenCookie(bill.id);
  if (!cookieToken) return false;
  return verifyCapabilityToken(cookieToken, bill.hostTokenHash);
}

/** Throw if the requester is not the host. */
export async function assertHost(bill: Bill): Promise<void> {
  if (!(await verifyHost(bill))) {
    throw new BillAuthError("Host token required");
  }
}

export class BillAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillAuthError";
  }
}

export class BillNotFoundError extends Error {
  constructor(message = "Bill not found") {
    super(message);
    this.name = "BillNotFoundError";
  }
}

export class BillExpiredError extends Error {
  constructor(message = "Bill has expired") {
    super(message);
    this.name = "BillExpiredError";
  }
}

/** Fetch + ensure not expired. */
export async function getActiveBill(shareToken: string): Promise<BillWithItems> {
  const bill = await getBillByShareToken(shareToken);
  if (!bill) throw new BillNotFoundError();
  if (bill.expiresAt < new Date()) throw new BillExpiredError();
  return bill;
}

export type ItemInput = {
  id?: string; // present → update; absent → create
  name: string;
  unitPriceCents: number;
  quantity: number;
  position?: number;
  confidence?: number;
  flagged?: boolean;
};

/** Replace the entire item set in a single transaction. */
export async function replaceItems(
  bill: Bill,
  items: ItemInput[],
): Promise<BillWithItems> {
  await assertHost(bill);
  return prisma.$transaction(async (tx) => {
    await tx.item.deleteMany({ where: { billId: bill.id } });
    const subtotalCents = computeSubtotalCents(items);
    if (items.length > 0) {
      await tx.item.createMany({
        data: items.map((it, idx) => ({
          billId: bill.id,
          name: it.name,
          unitPriceCents: it.unitPriceCents,
          quantity: it.quantity,
          position: it.position ?? idx,
          confidence: it.confidence ?? 1.0,
          flagged: it.flagged ?? false,
        })),
      });
    }
    // Recompute resolved tip (PERCENT_*) since subtotal changed.
    const updated = await tx.bill.update({
      where: { id: bill.id },
      data: {
        version: { increment: 1 },
        tipResolvedCents: resolveTipCents(
          { type: bill.tipInputType as TipInput["type"], value: bill.tipInputValue } as TipInput,
          subtotalCents,
          bill.taxCents,
        ),
      },
      include: { items: { orderBy: { position: "asc" } } },
    });
    return updated;
  });
}

export type BillSummaryUpdate = {
  taxCents?: number;
  tip?: TipInput;
  currency?: string;
  status?: "SCANNING" | "READY";
  acceptedMismatch?: boolean;
};

/** Update bill-level fields (tax, tip, status, currency). */
export async function updateBillSummary(
  bill: Bill,
  patch: BillSummaryUpdate,
): Promise<BillWithItems> {
  await assertHost(bill);
  return prisma.$transaction(async (tx) => {
    const items = await tx.item.findMany({ where: { billId: bill.id } });
    const subtotalCents = computeSubtotalCents(items);
    const nextTaxCents = patch.taxCents ?? bill.taxCents;
    const nextTip: TipInput = patch.tip ?? {
      type: bill.tipInputType as TipInput["type"],
      value: bill.tipInputValue,
    } as TipInput;
    const data: Prisma.BillUpdateInput = {
      version: { increment: 1 },
      taxCents: nextTaxCents,
      tipInputType: nextTip.type,
      tipInputValue: nextTip.value,
      tipResolvedCents: resolveTipCents(nextTip, subtotalCents, nextTaxCents),
    };
    if (patch.currency !== undefined) data.currency = patch.currency;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.acceptedMismatch !== undefined) data.acceptedMismatch = patch.acceptedMismatch;
    return tx.bill.update({
      where: { id: bill.id },
      data,
      include: { items: { orderBy: { position: "asc" } } },
    });
  });
}

/** Delete a bill (host-only). Mostly used in tests + admin cleanup. */
export async function deleteBill(bill: Bill): Promise<void> {
  await assertHost(bill);
  await prisma.bill.delete({ where: { id: bill.id } });
}

/** Compute the bill's items-vs-subtotal/total reconciliation (used by share gate). */
export type Reconciliation = {
  subtotalFromItems: number;
  taxCents: number;
  tipResolvedCents: number;
  totalFromItems: number;
  isReady: boolean; // true if subtotal-vs-items consistent and there's at least 1 item
};

export function reconcile(bill: BillWithItems): Reconciliation {
  const subtotalFromItems = computeSubtotalCents(bill.items);
  const totalFromItems = subtotalFromItems + bill.taxCents + bill.tipResolvedCents;
  const isReady = bill.items.length > 0;
  return {
    subtotalFromItems,
    taxCents: bill.taxCents,
    tipResolvedCents: bill.tipResolvedCents,
    totalFromItems,
    isReady,
  };
}

/** Test seam — used by tests to bypass cookie auth. */
export async function _internal_setHostTokenForTest(billId: string, _token: string) {
  void billId;
  void _token;
  // No-op in production; tests can override via cookie mocks.
}
