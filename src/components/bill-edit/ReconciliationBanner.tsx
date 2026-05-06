"use client";

import { CheckCircle2Icon, AlertTriangleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/utils";

type Props = {
  itemsTotalCents: number;
  subtotalCents?: number;
  toleranceCents?: number;
  acceptedMismatch: boolean;
  onAccept: () => void;
};

export function ReconciliationBanner({
  itemsTotalCents,
  subtotalCents,
  toleranceCents = 50,
  acceptedMismatch,
  onAccept,
}: Props) {
  if (subtotalCents === undefined) return null;

  const isMismatched = Math.abs(itemsTotalCents - subtotalCents) > toleranceCents;
  if (!isMismatched) return null;

  if (acceptedMismatch) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-100" role="status">
        <CheckCircle2Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p className="font-medium">Mismatch acknowledged</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p>
          Items add up to <strong>{formatCents(itemsTotalCents)}</strong> but receipt subtotal is{" "}
          <strong>{formatCents(subtotalCents)}</strong>. Adjust items or accept mismatch.
        </p>
      </div>
      <Button type="button" variant="outline" className="h-11 w-full rounded-xl bg-background/80" onClick={onAccept}>
        Accept anyway
      </Button>
    </div>
  );
}
