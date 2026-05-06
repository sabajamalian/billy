import { describe, expect, it } from "vitest";

import {
  billSubtotalCents,
  computeUserTotals,
  getShares,
  isItemSelected,
  itemBreakdowns,
  pruneStaleSelections,
  setShares,
  type BillForMath,
  type BillItemForMath,
  type Selections,
} from "./bill-math";

function bill(items: BillItemForMath[], taxCents = 0, tipResolvedCents = 0): BillForMath {
  return {
    taxCents,
    tipResolvedCents,
    items,
  };
}

describe("billSubtotalCents", () => {
  it("sums item unit prices multiplied by quantity", () => {
    expect(
      billSubtotalCents(
        bill([
          { id: "burger", unitPriceCents: 1600, quantity: 2 },
          { id: "discount", unitPriceCents: -200, quantity: 1 },
        ]),
      ),
    ).toBe(3000);
  });
});

describe("computeUserTotals", () => {
  it("returns zero user totals for empty selections while still computing positive rates", () => {
    const totals = computeUserTotals(bill([{ id: "burger", unitPriceCents: 1600, quantity: 1 }], 160, 320), {});

    expect(totals.userSubtotalCents).toBe(0);
    expect(totals.userTaxCents).toBe(0);
    expect(totals.userTipCents).toBe(0);
    expect(totals.userTotalCents).toBe(0);
    expect(totals.taxRate).toBeGreaterThan(0);
    expect(totals.tipRate).toBeGreaterThan(0);
    expect(totals.hasSelections).toBe(false);
  });

  it("sets rates to zero for a zero-subtotal bill without dividing by zero", () => {
    const totals = computeUserTotals(bill([{ id: "water", unitPriceCents: 0, quantity: 2 }], 100, 200), {
      water: 1,
    });

    expect(totals.billSubtotalCents).toBe(0);
    expect(totals.taxRate).toBe(0);
    expect(totals.tipRate).toBe(0);
    expect(totals.userTaxCents).toBe(0);
    expect(totals.userTipCents).toBe(0);
  });

  it("computes totals for a single item with a full share", () => {
    expect(computeUserTotals(bill([{ id: "burger", unitPriceCents: 1600, quantity: 1 }], 160, 320), { burger: 1 }))
      .toMatchObject({
        userSubtotalCents: 1600,
        userTaxCents: 160,
        userTipCents: 320,
        userTotalCents: 2080,
      });
  });

  it("computes totals for a half share", () => {
    expect(computeUserTotals(bill([{ id: "burger", unitPriceCents: 1600, quantity: 1 }], 160, 320), { burger: 0.5 }))
      .toMatchObject({
        userSubtotalCents: 800,
        userTaxCents: 80,
        userTipCents: 160,
        userTotalCents: 1040,
      });
  });

  it("computes totals for one and two selected shares of a two-unit item", () => {
    const twoBurgerBill = bill([{ id: "burger", unitPriceCents: 1600, quantity: 2 }], 320, 640);

    expect(computeUserTotals(twoBurgerBill, { burger: 2 })).toMatchObject({
      userSubtotalCents: 3200,
      userTaxCents: 320,
      userTipCents: 640,
      userTotalCents: 4160,
    });
    expect(computeUserTotals(twoBurgerBill, { burger: 1 })).toMatchObject({
      userSubtotalCents: 1600,
      userTaxCents: 160,
      userTipCents: 320,
      userTotalCents: 2080,
    });
  });

  it("computes totals for multiple items with mixed shares", () => {
    const totals = computeUserTotals(
      bill(
        [
          { id: "A", unitPriceCents: 1000, quantity: 1 },
          { id: "B", unitPriceCents: 500, quantity: 1 },
          { id: "C", unitPriceCents: 200, quantity: 1 },
        ],
        170,
        340,
      ),
      { A: 1, B: 0.5 },
    );

    expect(totals).toMatchObject({
      userSubtotalCents: 1250,
      userTaxCents: 125,
      userTipCents: 250,
      userTotalCents: 1625,
    });
  });

  it("computes totals with a negative item discount when selected or omitted", () => {
    const discountBill = bill(
      [
        { id: "Burger", unitPriceCents: 1600, quantity: 1 },
        { id: "Discount", unitPriceCents: -200, quantity: 1 },
      ],
      140,
      280,
    );

    expect(computeUserTotals(discountBill, { Burger: 1, Discount: 1 })).toMatchObject({
      userSubtotalCents: 1400,
      userTaxCents: 140,
      userTipCents: 280,
      userTotalCents: 1820,
    });
    expect(computeUserTotals(discountBill, { Burger: 1 })).toMatchObject({
      userSubtotalCents: 1600,
      userTaxCents: 160,
      userTipCents: 320,
      userTotalCents: 2080,
    });
  });

  it("ignores stale selections for non-existent items", () => {
    const totals = computeUserTotals(bill([{ id: "burger", unitPriceCents: 1600, quantity: 1 }], 160, 320), {
      burger: 1,
      stale: 10,
    });

    expect(totals.userSubtotalCents).toBe(1600);
    expect(totals.userTotalCents).toBe(2080);
  });

  it("returns hasSelections=false when no shares are greater than zero", () => {
    const totals = computeUserTotals(bill([{ id: "burger", unitPriceCents: 1600, quantity: 1 }], 160, 320), {
      burger: 0,
      stale: 1,
    });

    expect(totals.hasSelections).toBe(false);
  });

  it("returns hasSelections=true when a selected item's subtotal is zero", () => {
    const totals = computeUserTotals(bill([{ id: "water", unitPriceCents: 0, quantity: 1 }], 0, 0), {
      water: 1,
    });

    expect(totals.userSubtotalCents).toBe(0);
    expect(totals.hasSelections).toBe(true);
  });

  it("rounds proportional tax using Math.round for fractional rates", () => {
    const totals = computeUserTotals(bill([{ id: "item", unitPriceCents: 333, quantity: 1 }], 33, 0), {
      item: 110 / 333,
    });

    expect(totals.userSubtotalCents).toBe(110);
    expect(totals.userTaxCents).toBe(11);
  });

  it("uses Math.round for fractional shares that produce non-integer subtotals", () => {
    const totals = computeUserTotals(bill([{ id: "Item", unitPriceCents: 333, quantity: 1 }]), { Item: 0.5 });

    expect(totals.userSubtotalCents).toBe(167);
  });

  it("returns taxRate and tipRate consistent with bill-level subtotal", () => {
    const totals = computeUserTotals(bill([{ id: "item", unitPriceCents: 333, quantity: 1 }], 33, 66), {
      item: 1,
    });

    expect(totals.taxRate).toBe(33 / 333);
    expect(totals.tipRate).toBe(66 / 333);
  });
});

describe("itemBreakdowns", () => {
  it("sums approximately to the authoritative total within one cent per row", () => {
    const sharedBill = bill(
      [
        { id: "A", unitPriceCents: 101, quantity: 1 },
        { id: "B", unitPriceCents: 101, quantity: 1 },
        { id: "C", unitPriceCents: 131, quantity: 1 },
      ],
      33,
      67,
    );
    const selections: Selections = { A: 0.5, B: 0.5, C: 1 };
    const authoritativeTotal = computeUserTotals(sharedBill, selections).userTotalCents;
    const breakdownTotal = itemBreakdowns(sharedBill, selections).reduce(
      (sum, breakdown) => sum + breakdown.pickedTotalCents,
      0,
    );

    expect(Math.abs(breakdownTotal - authoritativeTotal)).toBeLessThanOrEqual(
      itemBreakdowns(sharedBill, selections).length,
    );
  });
});

describe("selection helpers", () => {
  it("pruneStaleSelections removes missing keys and keeps existing keys", () => {
    expect(
      pruneStaleSelections(
        [
          { id: "A", unitPriceCents: 100, quantity: 1 },
          { id: "B", unitPriceCents: 200, quantity: 1 },
        ],
        { A: 1, B: 0.5, stale: 1 },
      ),
    ).toEqual({ A: 1, B: 0.5 });
  });

  it("pruneStaleSelections also drops zero and negative shares", () => {
    expect(
      pruneStaleSelections(
        [
          { id: "A", unitPriceCents: 100, quantity: 1 },
          { id: "B", unitPriceCents: 200, quantity: 1 },
          { id: "C", unitPriceCents: 300, quantity: 1 },
        ],
        { A: 1, B: 0, C: -1 },
      ),
    ).toEqual({ A: 1 });
  });

  it("setShares with zero removes the key and returns a new object", () => {
    const selections = { A: 1, B: 2 };
    const nextSelections = setShares(selections, "A", 0);

    expect(nextSelections).toEqual({ B: 2 });
    expect(nextSelections).not.toBe(selections);
  });

  it("detects selected items and returns zero shares for absent items", () => {
    const selections = setShares({}, "A", 0.5);

    expect(isItemSelected(selections, "A")).toBe(true);
    expect(getShares(selections, "A")).toBe(0.5);
    expect(isItemSelected(selections, "B")).toBe(false);
    expect(getShares(selections, "B")).toBe(0);
  });
});
