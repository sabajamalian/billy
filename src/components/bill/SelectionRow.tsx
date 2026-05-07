"use client";

import { useState } from "react";
import { AlertTriangleIcon, CircleAlertIcon, UsersIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FractionalMenu } from "@/components/bill/FractionalMenu";
import { ShareStepper } from "@/components/bill/ShareStepper";
import type { BillDto } from "@/lib/dto";
import { cn, formatCents } from "@/lib/utils";

type Props = {
  item: BillDto["items"][number];
  shares: number;
  currency: string;
  onSharesChange: (shares: number) => void;
};

export function SelectionRow({ item, shares, currency, onSharesChange }: Props) {
  const [nameExpanded, setNameExpanded] = useState(false);
  const [fractionalOpen, setFractionalOpen] = useState(false);
  const totalCents = item.unitPriceCents * item.quantity;
  const confidencePercent = Math.round(item.confidence * 100);

  const toggle = () => onSharesChange(shares > 0 ? 0 : Math.min(1, item.quantity));

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-pressed={shares > 0}
      className={cn(
        "cursor-pointer touch-manipulation transition-colors focus-within:ring-3 focus-within:ring-ring/40",
        shares > 0 && "bg-primary/5 ring-primary/30",
        item.flagged && "border-amber-300 bg-amber-50/60 dark:bg-amber-950/20",
      )}
      onClick={toggle}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle();
        }
      }}
    >
      <CardContent className="grid gap-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <button
            type="button"
            className={cn(
              "min-h-11 min-w-0 flex-1 text-left text-lg font-semibold leading-snug outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              !nameExpanded && "truncate",
            )}
            title={item.name}
            onClick={(event) => {
              event.stopPropagation();
              setNameExpanded((expanded) => !expanded);
            }}
          >
            {item.name}
          </button>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {item.flagged && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangleIcon aria-hidden="true" /> uncertain
              </Badge>
            )}
            {item.confidence < 1 && (
              <Badge variant="outline" className="gap-1 text-amber-700 dark:text-amber-300">
                <CircleAlertIcon aria-hidden="true" /> {confidencePercent}%
              </Badge>
            )}
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          {formatCents(item.unitPriceCents, currency)} × {item.quantity} = {formatCents(totalCents, currency)}
        </div>

        <div className="flex items-end justify-between gap-3">
          {item.quantity > 1 ? (
            <span className="max-w-36 text-sm text-muted-foreground">How many units did you have?</span>
          ) : (
            <span className="text-sm text-muted-foreground">Tap card to add a share</span>
          )}
          <div onClick={(event) => event.stopPropagation()}>
            <ShareStepper
              shares={shares}
              maxShares={item.quantity}
              onChange={onSharesChange}
              onOpenFractionalMenu={() => setFractionalOpen(true)}
              ariaLabel={`Shares for ${item.name}`}
            />
          </div>
        </div>

        <button
          type="button"
          className={cn(
            "-mx-2 flex min-h-11 items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 px-3 text-sm font-medium text-muted-foreground transition-colors",
            "hover:border-primary/50 hover:bg-primary/5 hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          )}
          onClick={(event) => {
            event.stopPropagation();
            setFractionalOpen(true);
          }}
          aria-haspopup="dialog"
        >
          <UsersIcon aria-hidden="true" className="size-4" />
          Sharing this? Pick a fraction (¼ · ⅓ · ½ · …)
        </button>
      </CardContent>
      <FractionalMenu
        open={fractionalOpen}
        onOpenChange={setFractionalOpen}
        current={shares}
        maxShares={item.quantity}
        onPick={onSharesChange}
      />
    </Card>
  );
}
