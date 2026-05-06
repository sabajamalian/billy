"use client";

import { useEffect, useRef, useState } from "react";
import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ItemEditorRow, type ItemDraft } from "@/components/bill-edit/ItemEditorRow";

export type { ItemDraft } from "@/components/bill-edit/ItemEditorRow";

type Props = {
  initialItems: ItemDraft[];
  currency?: string;
  onChange: (items: ItemDraft[]) => void;
};

function createEmptyItem(): ItemDraft {
  return { name: "", unitPriceCents: 0, quantity: 1, confidence: 1, flagged: false };
}

export function ItemEditor({ initialItems, currency = "USD", onChange }: Props) {
  const [items, setItems] = useState<ItemDraft[]>(initialItems);
  const [autoFocusIndex, setAutoFocusIndex] = useState<number | null>(null);
  const previousInitialItems = useRef(initialItems);

  useEffect(() => {
    if (previousInitialItems.current !== initialItems) {
      previousInitialItems.current = initialItems;
      setItems(initialItems);
    }
  }, [initialItems]);

  const commit = (next: ItemDraft[]) => {
    setItems(next);
    onChange(next);
  };

  const addItem = () => {
    const next = [...items, createEmptyItem()];
    setAutoFocusIndex(next.length - 1);
    commit(next);
  };

  return (
    <section aria-labelledby="items-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="items-heading" className="text-xl font-semibold tracking-tight">
            Items
          </h2>
          <p className="text-sm text-muted-foreground">Add each receipt line and adjust quantities.</p>
        </div>
      </div>

      <div className="space-y-3 pb-16">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No items yet. Add the first line from your receipt.
          </div>
        ) : null}
        {items.map((item, index) => (
          <ItemEditorRow
            key={item.id ?? `draft-${index}`}
            item={item}
            currency={currency}
            autoFocus={autoFocusIndex === index}
            onChange={(nextItem) => {
              const next = items.map((candidate, itemIndex) => (itemIndex === index ? nextItem : candidate));
              commit(next);
            }}
            onRemove={() => commit(items.filter((_, itemIndex) => itemIndex !== index))}
          />
        ))}
      </div>

      <div className="sticky bottom-28 z-10 -mx-1 px-1 pb-2">
        <Button type="button" size="lg" variant="secondary" className="h-12 w-full rounded-2xl shadow-lg" onClick={addItem}>
          <PlusIcon aria-hidden="true" />
          Add item
        </Button>
      </div>
    </section>
  );
}
