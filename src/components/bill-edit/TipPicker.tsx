"use client";

import { useMemo, useState } from "react";
import { InfoIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatCents } from "@/lib/utils";

export type TipState =
  | { type: "PERCENT_PRE_TAX"; value: number }
  | { type: "PERCENT_POST_TAX"; value: number }
  | { type: "FLAT"; value: number }
  | { type: "RECEIPT_GRATUITY"; value: 0 };

type Props = {
  tip: TipState;
  subtotalCents: number;
  taxCents: number;
  onChange: (next: TipState) => void;
};

type ActiveTab = "percent" | "flat" | "receipt";

function resolveTipCents(tip: TipState, subtotalCents: number, taxCents: number): number {
  switch (tip.type) {
    case "FLAT":
      return Math.max(0, Math.round(tip.value));
    case "RECEIPT_GRATUITY":
      return 0;
    case "PERCENT_PRE_TAX":
      return Math.max(0, Math.round((tip.value / 100) * subtotalCents));
    case "PERCENT_POST_TAX":
      return Math.max(0, Math.round((tip.value / 100) * (subtotalCents + taxCents)));
  }
}

function tabForTip(tip: TipState): ActiveTab {
  if (tip.type === "FLAT") return "flat";
  if (tip.type === "RECEIPT_GRATUITY") return "receipt";
  return "percent";
}

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function parseMoneyToCents(value: string): number {
  const amount = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.round(amount * 100));
}

export function TipPicker({ tip, subtotalCents, taxCents, onChange }: Props) {
  const [customPercent, setCustomPercent] = useState(
    tip.type === "PERCENT_PRE_TAX" || tip.type === "PERCENT_POST_TAX" ? String(tip.value) : "18",
  );
  const [flatText, setFlatText] = useState(tip.type === "FLAT" ? centsToInput(tip.value) : "0.00");
  const activeTab = tabForTip(tip);
  const previewCents = useMemo(() => resolveTipCents(tip, subtotalCents, taxCents), [tip, subtotalCents, taxCents]);
  const percentBase = tip.type === "PERCENT_POST_TAX" ? "post" : "pre";
  const percentValue = tip.type === "PERCENT_PRE_TAX" || tip.type === "PERCENT_POST_TAX" ? tip.value : Number.parseFloat(customPercent) || 18;

  const setPercent = (value: number, base = percentBase) => {
    const type = base === "post" ? "PERCENT_POST_TAX" : "PERCENT_PRE_TAX";
    setCustomPercent(String(value));
    onChange({ type, value });
  };

  const commitCustomPercent = () => {
    const value = Math.min(100, Math.max(0, Number.parseFloat(customPercent) || 0));
    setCustomPercent(String(value));
    setPercent(value);
  };

  const commitFlat = () => {
    const value = parseMoneyToCents(flatText);
    setFlatText(centsToInput(value));
    onChange({ type: "FLAT", value });
  };

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm" aria-labelledby="tip-heading">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 id="tip-heading" className="text-lg font-semibold tracking-tight">
            Tip
          </h2>
          <p className="text-sm text-muted-foreground">Tip: {formatCents(previewCents)}</p>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const next = value as ActiveTab;
          if (next === "percent") setPercent(percentValue);
          if (next === "flat") onChange({ type: "FLAT", value: parseMoneyToCents(flatText) });
          if (next === "receipt") onChange({ type: "RECEIPT_GRATUITY", value: 0 });
        }}
      >
        <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl">
          <TabsTrigger value="percent" className="min-h-11 text-wrap px-2 py-2">
            Percent
          </TabsTrigger>
          <TabsTrigger value="flat" className="min-h-11 text-wrap px-2 py-2">
            Flat amount
          </TabsTrigger>
          <TabsTrigger value="receipt" className="min-h-11 text-wrap px-2 py-2">
            Already on receipt
          </TabsTrigger>
        </TabsList>

        <TabsContent value="percent" className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Tip percentage presets">
            {[15, 18, 20].map((preset) => (
              <Button
                key={preset}
                type="button"
                variant={percentValue === preset ? "default" : "outline"}
                className="h-12 rounded-xl"
                onClick={() => setPercent(preset)}
              >
                {preset}%
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="custom-tip-percent">Custom percent</Label>
            <div className="relative">
              <Input
                id="custom-tip-percent"
                value={customPercent}
                onChange={(event) => setCustomPercent(event.target.value)}
                onBlur={commitCustomPercent}
                inputMode="decimal"
                className="h-12 rounded-xl pr-8 text-right text-lg"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tip calculation base">
            <Button
              type="button"
              variant={percentBase === "pre" ? "default" : "outline"}
              className="h-12 rounded-xl text-wrap"
              onClick={() => setPercent(percentValue, "pre")}
            >
              Calculate on subtotal
            </Button>
            <Button
              type="button"
              variant={percentBase === "post" ? "default" : "outline"}
              className="h-12 rounded-xl text-wrap"
              onClick={() => setPercent(percentValue, "post")}
            >
              Calculate on subtotal + tax
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="flat" className="mt-4 space-y-2">
          <Label htmlFor="flat-tip">Flat tip amount</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <Input
              id="flat-tip"
              value={flatText}
              onChange={(event) => setFlatText(event.target.value)}
              onBlur={commitFlat}
              inputMode="decimal"
              className="h-12 rounded-xl pl-7 text-right text-lg"
            />
          </div>
        </TabsContent>

        <TabsContent value="receipt" className="mt-4">
          <div className={cn("flex gap-3 rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground")}>
            <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>Use this when gratuity or service charge is already listed as a receipt item. Billy will not add extra tip.</p>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

export { resolveTipCents };
