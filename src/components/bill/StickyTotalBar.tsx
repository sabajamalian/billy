"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { computeUserTotals, itemBreakdowns } from "@/lib/bill-math";
import type { BillDto } from "@/lib/dto";
import { cn, formatCents } from "@/lib/utils";

type Props = {
  bill: BillDto;
  selections: Record<string, number>;
  onShareClick?: () => void;
};

export function StickyTotalBar({ bill, selections, onShareClick }: Props) {
  const [expanded, setExpanded] = useState(false);
  const totals = useMemo(() => computeUserTotals(bill, selections), [bill, selections]);
  const breakdowns = useMemo(() => itemBreakdowns(bill, selections), [bill, selections]);
  const itemNames = useMemo(() => new Map(bill.items.map((item) => [item.id, item.name])), [bill.items]);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pt-3 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-background/85 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div className="mx-auto max-w-2xl">
        {expanded && (
          <div className="mb-3 max-h-56 overflow-y-auto rounded-xl border bg-card p-3 text-sm shadow-sm">
            {breakdowns.length === 0 ? (
              <p className="text-muted-foreground">Pick items to see your breakdown.</p>
            ) : (
              <div className="grid gap-2">
                {breakdowns.map((breakdown) => (
                  <div key={breakdown.itemId} className="grid gap-1">
                    <div className="flex justify-between gap-3 font-medium">
                      <span className="truncate">{itemNames.get(breakdown.itemId) ?? "Item"}</span>
                      <span>{formatCents(breakdown.pickedTotalCents, bill.currency)}</span>
                    </div>
                    <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                      <span>
                        {breakdown.shares} × {formatCents(breakdown.unitPriceCents, bill.currency)}
                      </span>
                      <span>
                        tax {formatCents(breakdown.pickedTaxCents, bill.currency)} · tip{" "}
                        {formatCents(breakdown.pickedTipCents, bill.currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="min-h-11 min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <div className="flex items-center gap-2">
              <span
                key={totals.userTotalCents}
                className={cn("text-3xl font-bold text-primary tabular-nums transition-transform duration-200 animate-in zoom-in-95")}
                aria-live="polite"
              >
                {formatCents(totals.userTotalCents, bill.currency)}
              </span>
              {expanded ? <ChevronDownIcon className="size-5" aria-hidden="true" /> : <ChevronUpIcon className="size-5" aria-hidden="true" />}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              Subtotal {formatCents(totals.userSubtotalCents, bill.currency)} · Tax{" "}
              {formatCents(totals.userTaxCents, bill.currency)} · Tip {formatCents(totals.userTipCents, bill.currency)}
            </div>
          </button>
          <Separator orientation="vertical" className="h-12" />
          <Button type="button" className="min-h-11 px-5" onClick={onShareClick}>
            Share
          </Button>
        </div>
      </div>
    </div>
  );
}
