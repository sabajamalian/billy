export type BillItemForMath = {
  id: string;
  unitPriceCents: number;
  quantity: number;
};

export type BillForMath = {
  taxCents: number;
  tipResolvedCents: number;
  items: BillItemForMath[];
};

export type Selections = Record<string, number>;

export type UserTotals = {
  userSubtotalCents: number;
  userTaxCents: number;
  userTipCents: number;
  userTotalCents: number;
  taxRate: number;
  tipRate: number;
  billSubtotalCents: number;
  hasSelections: boolean;
};

export type ItemBreakdown = {
  itemId: string;
  shares: number;
  unitPriceCents: number;
  pickedSubtotalCents: number;
  pickedTaxCents: number;
  pickedTipCents: number;
  pickedTotalCents: number;
};

export function billSubtotalCents(bill: BillForMath): number {
  return bill.items.reduce((subtotal, item) => subtotal + item.unitPriceCents * item.quantity, 0);
}

export function computeUserTotals(bill: BillForMath, selections: Selections): UserTotals {
  const subtotal = billSubtotalCents(bill);
  const taxRate = subtotal > 0 ? bill.taxCents / subtotal : 0;
  const tipRate = subtotal > 0 ? bill.tipResolvedCents / subtotal : 0;
  const rawUserSubtotal = bill.items.reduce((sum, item) => {
    const shares = getShares(selections, item.id);

    return shares > 0 ? sum + item.unitPriceCents * shares : sum;
  }, 0);
  const userSubtotalCents = Math.round(rawUserSubtotal);
  const userTaxCents = Math.round(userSubtotalCents * taxRate);
  const userTipCents = Math.round(userSubtotalCents * tipRate);

  return {
    userSubtotalCents,
    userTaxCents,
    userTipCents,
    userTotalCents: userSubtotalCents + userTaxCents + userTipCents,
    taxRate,
    tipRate,
    billSubtotalCents: subtotal,
    hasSelections: bill.items.some((item) => isItemSelected(selections, item.id)),
  };
}

export function itemBreakdowns(bill: BillForMath, selections: Selections): ItemBreakdown[] {
  const subtotal = billSubtotalCents(bill);
  const taxRate = subtotal > 0 ? bill.taxCents / subtotal : 0;
  const tipRate = subtotal > 0 ? bill.tipResolvedCents / subtotal : 0;

  return bill.items.flatMap((item) => {
    const shares = getShares(selections, item.id);

    if (!(shares > 0)) {
      return [];
    }

    const pickedSubtotalCents = Math.round(item.unitPriceCents * shares);
    const pickedTaxCents = Math.round(pickedSubtotalCents * taxRate);
    const pickedTipCents = Math.round(pickedSubtotalCents * tipRate);

    return [
      {
        itemId: item.id,
        shares,
        unitPriceCents: item.unitPriceCents,
        pickedSubtotalCents,
        pickedTaxCents,
        pickedTipCents,
        pickedTotalCents: pickedSubtotalCents + pickedTaxCents + pickedTipCents,
      },
    ];
  });
}

export function pruneStaleSelections(items: BillItemForMath[], selections: Selections): Selections {
  const itemIds = new Set(items.map((item) => item.id));

  return Object.fromEntries(
    Object.entries(selections).filter(([itemId, shares]) => itemIds.has(itemId) && shares > 0),
  );
}

export function isItemSelected(selections: Selections, itemId: string): boolean {
  return getShares(selections, itemId) > 0;
}

export function getShares(selections: Selections, itemId: string): number {
  return selections[itemId] ?? 0;
}

export function setShares(selections: Selections, itemId: string, shares: number): Selections {
  const nextSelections = { ...selections };

  if (shares > 0) {
    nextSelections[itemId] = shares;
  } else {
    delete nextSelections[itemId];
  }

  return nextSelections;
}
