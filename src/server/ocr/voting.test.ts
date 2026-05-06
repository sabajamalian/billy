import { describe, expect, it } from "vitest";
import { type OcrItem, type OcrRun, voteOcr } from "./voting";

function run(
  items: OcrItem[],
  amounts: Partial<{
    taxCents: number;
    tipCents: number;
    subtotalCents: number;
    totalCents: number;
    currency: string;
  }> = {},
): OcrRun {
  const subtotalCents = amounts.subtotalCents ?? items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const taxCents = amounts.taxCents ?? 0;
  const tipCents = amounts.tipCents ?? 0;

  return {
    provider: "test",
    model: "model",
    ok: true,
    result: {
      items,
      taxCents,
      tipCents,
      subtotalCents,
      totalCents: amounts.totalCents ?? subtotalCents + taxCents + tipCents,
      currency: amounts.currency ?? "USD",
    },
  };
}

function item(name: string, unitPriceCents: number, quantity = 1): OcrItem {
  return { name, quantity, unitPriceCents };
}

describe("voteOcr", () => {
  it("returns an empty bill with no mismatch when N=0", () => {
    const bill = voteOcr([
      { provider: "test", model: "model", ok: false, error: "failed" },
    ]);

    expect(bill.items).toEqual([]);
    expect(bill.successfulRunCount).toBe(0);
    expect(bill.totalRunCount).toBe(1);
    expect(bill.subtotalMismatch).toBe(false);
    expect(bill.votedItemsTotalCents).toBe(0);
  });

  it("flags every item for a single successful provider even with confidence 1.0", () => {
    const bill = voteOcr([run([item("Burger", 1600), item("Fries", 500)])]);

    expect(bill.items).toHaveLength(2);
    expect(bill.items.every((votedItem) => votedItem.confidence === 1)).toBe(true);
    expect(bill.items.every((votedItem) => votedItem.flagged)).toBe(true);
  });

  it("returns unflagged items with confidence 1.0 for three providers in full agreement", () => {
    const runs = Array.from({ length: 3 }, () =>
      run([item("Burger", 1600), item("Fries", 500)], { taxCents: 200, tipCents: 300 }),
    );

    const bill = voteOcr(runs);

    expect(bill.items).toEqual([
      { name: "Burger", quantity: 1, unitPriceCents: 1600, confidence: 1, flagged: false },
      { name: "Fries", quantity: 1, unitPriceCents: 500, confidence: 1, flagged: false },
    ]);
    expect(bill.taxCents).toBe(200);
    expect(bill.tipCents).toBe(300);
    expect(bill.subtotalMismatch).toBe(false);
  });

  it("includes quorum items and drops below-quorum alternatives", () => {
    const bill = voteOcr([
      run([item("Burger", 1600)]),
      run([item("Burger", 1600)]),
      run([item("Bagel", 1600)]),
    ]);

    expect(bill.items).toHaveLength(1);
    expect(bill.items[0]?.name).toBe("Burger");
    expect(bill.items[0]?.confidence).toBeCloseTo(2 / 3);
    expect(bill.items[0]?.flagged).toBe(true);
  });

  it("merges duplicate item clusters into one voted item quantity", () => {
    const runs = Array.from({ length: 3 }, () => run([item("Burger", 1600), item("Burger", 1600)]));

    const bill = voteOcr(runs);

    expect(bill.items).toEqual([
      { name: "Burger", quantity: 2, unitPriceCents: 1600, confidence: 1, flagged: false },
    ]);
  });

  it("aligns mixed quantity representations into the same voted quantity", () => {
    const bill = voteOcr([
      run([item("Burger", 1600, 2)]),
      run([item("Burger", 1600), item("Burger", 1600)]),
    ]);

    expect(bill.items).toEqual([
      { name: "Burger", quantity: 2, unitPriceCents: 1600, confidence: 1, flagged: false },
    ]);
  });

  it("uses the median unit price across matching item votes", () => {
    const bill = voteOcr([
      run([item("Burger", 1500)]),
      run([item("Burger", 1600)]),
      run([item("Burger", 1700)]),
    ], { priceProximityFraction: 0.2 });

    expect(bill.items[0]?.unitPriceCents).toBe(1600);
  });

  it("flags a subtotal mismatch when voted items differ from subtotal beyond tolerance", () => {
    const runs = Array.from({ length: 3 }, () => run([item("Burger", 2000)], { subtotalCents: 2500 }));

    const bill = voteOcr(runs);

    expect(bill.votedItemsTotalCents).toBe(2000);
    expect(bill.subtotalCents).toBe(2500);
    expect(bill.subtotalMismatch).toBe(true);
  });

  it("does not flag subtotal mismatch within the default 50-cent tolerance", () => {
    const runs = Array.from({ length: 3 }, () => run([item("Burger", 2000)], { subtotalCents: 2049 }));

    const bill = voteOcr(runs);

    expect(bill.subtotalMismatch).toBe(false);
    expect(bill.subtotalMismatchDetail.toleranceCents).toBe(50);
  });

  it("flags the subtotal tolerance edge when the difference is 51 cents", () => {
    const runs = Array.from({ length: 3 }, () => run([item("Burger", 2000)], { subtotalCents: 2051 }));

    const bill = voteOcr(runs);

    expect(bill.subtotalMismatch).toBe(true);
  });

  it("votes negative discount items and includes them in the item total", () => {
    const runs = Array.from({ length: 3 }, () => run([item("Discount", -500)], { subtotalCents: -500 }));

    const bill = voteOcr(runs);

    expect(bill.items).toEqual([
      { name: "Discount", quantity: 1, unitPriceCents: -500, confidence: 1, flagged: false },
    ]);
    expect(bill.votedItemsTotalCents).toBe(-500);
    expect(bill.subtotalMismatch).toBe(false);
  });

  it("uses median tax and tip values", () => {
    const bill = voteOcr([
      run([item("Burger", 1600)], { taxCents: 200, tipCents: 100 }),
      run([item("Burger", 1600)], { taxCents: 250, tipCents: 300 }),
      run([item("Burger", 1600)], { taxCents: 300, tipCents: 200 }),
    ]);

    expect(bill.taxCents).toBe(250);
    expect(bill.tipCents).toBe(200);
  });

  it("drops a price-mismatched run item that cannot join the matching cluster", () => {
    const bill = voteOcr([
      run([item("Burger", 1600)]),
      run([item("Burger", 1600)]),
      run([item("Burger", 2500)]),
    ]);

    expect(bill.items).toHaveLength(1);
    expect(bill.items[0]?.name).toBe("Burger");
    expect(bill.items[0]?.unitPriceCents).toBe(1600);
    expect(bill.items[0]?.confidence).toBeCloseTo(2 / 3);
  });

  it("filters failed runs and computes quorum/confidence from successful runs", () => {
    const bill = voteOcr([
      run([item("Burger", 1600)]),
      run([]),
      { provider: "test", model: "model", ok: false, error: "failed" },
    ]);

    expect(bill.successfulRunCount).toBe(2);
    expect(bill.totalRunCount).toBe(3);
    expect(bill.items).toEqual([
      { name: "Burger", quantity: 1, unitPriceCents: 1600, confidence: 0.5, flagged: true },
    ]);
  });

  it("honors a custom unanimous quorum", () => {
    const bill = voteOcr([
      run([item("Burger", 1600)]),
      run([item("Burger", 1600)]),
      run([item("Bagel", 1600)]),
    ], { quorum: (n) => n });

    expect(bill.items).toEqual([]);
  });
});
