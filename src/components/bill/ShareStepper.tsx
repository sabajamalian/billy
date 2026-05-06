"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  shares: number;
  maxShares?: number;
  step?: number;
  onChange: (next: number) => void;
  onOpenFractionalMenu?: () => void;
  ariaLabel?: string;
};

const LONG_PRESS_MS = 500;

function formatShareDisplay(shares: number): string {
  const whole = Math.trunc(shares);
  const fraction = Math.round((shares - whole) * 100) / 100;
  const glyph = fraction === 0.25 ? "¼" : fraction === 0.5 ? "½" : fraction === 0.75 ? "¾" : "";

  if (glyph) return whole > 0 ? `${whole}${glyph}` : glyph;
  if (Number.isInteger(shares)) return String(shares);
  return shares.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

const clamp = (value: number, max: number): number => Math.min(Math.max(0, value), max);

export function ShareStepper({
  shares,
  maxShares = Infinity,
  step = 1,
  onChange,
  onOpenFractionalMenu,
  ariaLabel = "Item shares",
}: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPress = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => clearLongPress, []);

  const commit = (next: number) => onChange(clamp(next, maxShares));
  const canDecrement = shares > 0;
  const canIncrement = shares < maxShares;

  const startLongPress = () => {
    clearLongPress();
    timerRef.current = setTimeout(() => {
      onOpenFractionalMenu?.();
    }, LONG_PRESS_MS);
  };

  const finishLongPress = () => {
    clearLongPress();
  };

  return (
    <div
      className="inline-flex items-center rounded-xl border border-border bg-background shadow-sm"
      role="group"
      aria-label={ariaLabel}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          commit(shares - step);
        }
        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          commit(shares + step);
        }
      }}
    >
      <Button
        type="button"
        variant="outline"
        className="min-h-11 min-w-11 rounded-r-none border-0 text-2xl"
        disabled={!canDecrement}
        aria-label="Decrease shares"
        onClick={(event) => {
          event.stopPropagation();
          commit(shares - step);
        }}
      >
        −
      </Button>
      <button
        type="button"
        className={cn(
          "min-h-11 min-w-16 border-x border-border px-3 text-center text-lg font-semibold tabular-nums outline-none transition-colors",
          "focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
        aria-label={`${ariaLabel}: ${formatShareDisplay(shares)} selected. Long press for fractional shares.`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          event.stopPropagation();
          startLongPress();
        }}
        onPointerUp={finishLongPress}
        onPointerCancel={finishLongPress}
        onPointerLeave={finishLongPress}
      >
        {formatShareDisplay(shares)}
      </button>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 min-w-11 rounded-l-none border-0 text-2xl"
        disabled={!canIncrement}
        aria-label="Increase shares"
        onClick={(event) => {
          event.stopPropagation();
          commit(shares + step);
        }}
      >
        +
      </Button>
    </div>
  );
}
