"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: number;
  maxShares?: number;
  onPick: (shares: number) => void;
};

const OPTIONS = [
  { label: "¼", value: 0.25 },
  { label: "½", value: 0.5 },
  { label: "¾", value: 0.75 },
  { label: "1", value: 1 },
  { label: "1½", value: 1.5 },
  { label: "2", value: 2 },
];

const clamp = (value: number, max: number): number => Math.min(Math.max(0, value), max);

export function FractionalMenu({ open, onOpenChange, current, maxShares = Infinity, onPick }: Props) {
  const [showCustom, setShowCustom] = useState(false);
  const [custom, setCustom] = useState(String(current || ""));

  useEffect(() => {
    if (open) {
      setShowCustom(false);
      setCustom(String(current || ""));
    }
  }, [current, open]);

  const pick = (shares: number) => {
    onPick(clamp(shares, maxShares));
    onOpenChange(false);
  };

  const parsedCustom = Number(custom);
  const canSaveCustom = Number.isFinite(parsedCustom) && parsedCustom >= 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <SheetHeader className="pr-12">
          <SheetTitle>Choose your share</SheetTitle>
          <SheetDescription>Use fractions for shared dishes or enter a custom amount.</SheetDescription>
        </SheetHeader>
        <div className="grid grid-cols-3 gap-3 px-4">
          {OPTIONS.map((option) => (
            <Button
              key={option.label}
              type="button"
              variant={current === option.value ? "default" : "outline"}
              className="min-h-11 text-lg"
              disabled={option.value > maxShares}
              onClick={() => pick(option.value)}
            >
              {option.label}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            className="col-span-3 min-h-11"
            onClick={() => setShowCustom((value) => !value)}
          >
            Custom…
          </Button>
        </div>
        {showCustom && (
          <div className="grid gap-3 px-4 pb-2">
            <Label htmlFor="custom-shares">Custom shares</Label>
            <div className="flex gap-2">
              <Input
                id="custom-shares"
                type="number"
                min="0"
                max={Number.isFinite(maxShares) ? maxShares : undefined}
                step="0.25"
                inputMode="decimal"
                className="min-h-11 text-lg"
                value={custom}
                onChange={(event) => setCustom(event.target.value)}
              />
              <Button type="button" className="min-h-11" disabled={!canSaveCustom} onClick={() => pick(parsedCustom)}>
                Apply
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
