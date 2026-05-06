"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents } from "@/lib/utils";

type Props = {
  taxCents: number;
  currency?: string;
  onChange: (taxCents: number) => void;
};

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function parseMoneyToCents(value: string): number {
  const amount = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.round(amount * 100));
}

export function TaxField({ taxCents, currency = "USD", onChange }: Props) {
  const [taxText, setTaxText] = useState(centsToInput(taxCents));

  const commitTax = () => {
    const next = parseMoneyToCents(taxText);
    setTaxText(centsToInput(next));
    onChange(next);
  };

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm" aria-labelledby="tax-heading">
      <div className="mb-3">
        <h2 id="tax-heading" className="text-lg font-semibold tracking-tight">
          Tax
        </h2>
        <p className="text-sm text-muted-foreground">Receipt tax, currently {formatCents(taxCents, currency)}.</p>
      </div>
      <div className="relative">
        <Label htmlFor="bill-tax" className="sr-only">
          Tax amount
        </Label>
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
        <Input
          id="bill-tax"
          value={taxText}
          onChange={(event) => setTaxText(event.target.value)}
          onBlur={commitTax}
          inputMode="decimal"
          className="h-12 rounded-xl pl-7 text-right text-lg"
          aria-label="Tax amount"
        />
      </div>
    </section>
  );
}
