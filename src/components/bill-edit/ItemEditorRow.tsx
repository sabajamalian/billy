"use client";

import { useId, useMemo, useState } from "react";
import { AlertTriangleIcon, MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatCents } from "@/lib/utils";

export type ItemDraft = {
  id?: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  flagged?: boolean;
  confidence?: number;
};

type Props = {
  item: ItemDraft;
  currency?: string;
  onChange: (next: ItemDraft) => void;
  onRemove: () => void;
  autoFocus?: boolean;
};

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function parseMoneyToCents(value: string): number {
  const normalized = value.replace(/[^0-9.-]/g, "");
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

export function ItemEditorRow({ item, currency = "USD", onChange, onRemove, autoFocus }: Props) {
  const generatedId = useId();
  const rowId = item.id ?? generatedId;
  const [priceText, setPriceText] = useState(centsToInput(item.unitPriceCents));

  const confidenceLabel = useMemo(() => {
    if (item.confidence === undefined) return undefined;
    return `${Math.round(item.confidence * 100)}% confidence`;
  }, [item.confidence]);

  const updateQuantity = (quantity: number) => {
    onChange({ ...item, quantity: Math.min(99, Math.max(1, quantity)) });
  };

  const commitPrice = () => {
    const unitPriceCents = parseMoneyToCents(priceText);
    setPriceText(centsToInput(unitPriceCents));
    onChange({ ...item, unitPriceCents });
  };

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-3 shadow-sm",
        item.flagged && "border-amber-300 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-950/20",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <Label className="sr-only" htmlFor={`item-name-${rowId}`}>
            Item name
          </Label>
          <Input
            id={`item-name-${rowId}`}
            value={item.name}
            onChange={(event) => onChange({ ...item, name: event.target.value })}
            placeholder="Item name"
            autoFocus={autoFocus}
            className="h-12 rounded-xl text-lg font-medium"
          />
          {item.flagged ? (
            <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              <AlertTriangleIcon aria-hidden="true" />
              <span>Uncertain</span>
              {confidenceLabel ? <span className="sr-only">, {confidenceLabel}</span> : null}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex h-11 shrink-0 items-center overflow-hidden rounded-xl border bg-background" aria-label="Quantity">
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="h-11 w-11 rounded-none"
            onClick={() => updateQuantity(item.quantity - 1)}
            aria-label="Decrease quantity"
            disabled={item.quantity <= 1}
          >
            <MinusIcon aria-hidden="true" />
          </Button>
          <output className="min-w-10 px-2 text-center text-base font-semibold" aria-live="polite">
            {item.quantity}
          </output>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="h-11 w-11 rounded-none"
            onClick={() => updateQuantity(item.quantity + 1)}
            aria-label="Increase quantity"
            disabled={item.quantity >= 99}
          >
            <PlusIcon aria-hidden="true" />
          </Button>
        </div>

        <div className="relative min-w-0 flex-1">
          <Label className="sr-only" htmlFor={`item-price-${rowId}`}>
            Unit price, currently {formatCents(item.unitPriceCents, currency)}
          </Label>
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
          <Input
            id={`item-price-${rowId}`}
            value={priceText}
            onChange={(event) => setPriceText(event.target.value)}
            onBlur={commitPrice}
            inputMode="decimal"
            className="h-11 rounded-xl pl-7 text-right text-base"
            aria-label="Unit price"
          />
        </div>

        <Button
          type="button"
          variant="destructive"
          size="icon-lg"
          className="h-11 w-11 shrink-0"
          onClick={onRemove}
          aria-label={`Remove ${item.name || "item"}`}
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
