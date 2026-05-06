"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Check, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type { BillDto } from "@/lib/dto";
import {
  computeUserTotals,
  itemBreakdowns,
  type Selections,
} from "@/lib/bill-math";
import { formatCents } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill: BillDto;
  selections: Selections;
  nickname?: string;
};

export function ExportShareDialog({ open, onOpenChange, bill, selections, nickname }: Props) {
  const totals = computeUserTotals(bill, selections);
  const breakdowns = itemBreakdowns(bill, selections);
  const itemMap = new Map(bill.items.map((it) => [it.id, it]));

  const [copied, setCopied] = useState(false);

  const fmt = (cents: number) => formatCents(cents, bill.currency);

  const lines: string[] = [];
  if (nickname) lines.push(`**${nickname}**`);
  lines.push(`| Item | Shares | Amount |`);
  lines.push(`| --- | --- | --- |`);
  for (const b of breakdowns) {
    const item = itemMap.get(b.itemId);
    if (!item) continue;
    lines.push(
      `| ${item.name} | ${formatShares(b.shares)} | ${fmt(b.pickedSubtotalCents)} |`,
    );
  }
  lines.push("");
  lines.push(`Subtotal: ${fmt(totals.userSubtotalCents)}`);
  lines.push(`Tax: ${fmt(totals.userTaxCents)}`);
  lines.push(`Tip: ${fmt(totals.userTipCents)}`);
  lines.push(`**Total: ${fmt(totals.userTotalCents)}**`);

  const markdown = lines.join("\n");

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Your share</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="card" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="card">
              <ImageIcon aria-hidden="true" className="mr-2 h-4 w-4" /> Card
            </TabsTrigger>
            <TabsTrigger value="text">
              <Copy aria-hidden="true" className="mr-2 h-4 w-4" /> Text
            </TabsTrigger>
          </TabsList>

          <TabsContent value="card" className="mt-3">
            <ShareCard bill={bill} selections={selections} nickname={nickname} />
          </TabsContent>

          <TabsContent value="text" className="mt-3 space-y-3">
            <pre className="max-h-72 overflow-auto rounded-md border bg-zinc-50 p-3 font-mono text-xs whitespace-pre-wrap dark:bg-zinc-900">
              {markdown}
            </pre>
            <Button onClick={onCopy} className="w-full">
              {copied ? (
                <>
                  <Check aria-hidden="true" className="mr-2 h-4 w-4" /> Copied
                </>
              ) : (
                <>
                  <Copy aria-hidden="true" className="mr-2 h-4 w-4" /> Copy to clipboard
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** Visual card the user can screenshot. Designed to look good as a square image. */
function ShareCard({
  bill,
  selections,
  nickname,
}: {
  bill: BillDto;
  selections: Selections;
  nickname?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const totals = computeUserTotals(bill, selections);
  const breakdowns = itemBreakdowns(bill, selections);
  const itemMap = new Map(bill.items.map((it) => [it.id, it]));
  const fmt = (cents: number) => formatCents(cents, bill.currency);

  // Hint to user
  useEffect(() => {
    if (cardRef.current) {
      cardRef.current.setAttribute("data-screenshot-target", "true");
    }
  }, []);

  return (
    <div
      ref={cardRef}
      className="space-y-3 rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-white to-amber-50 p-5 text-sm dark:from-amber-950/30 dark:via-zinc-950 dark:to-amber-950/30"
    >
      {nickname ? (
        <div className="text-base font-semibold">{nickname}&apos;s share</div>
      ) : (
        <div className="text-base font-semibold">My share</div>
      )}

      <ul className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
        {breakdowns.map((b) => {
          const item = itemMap.get(b.itemId);
          if (!item) return null;
          return (
            <li key={b.itemId} className="flex justify-between gap-2">
              <span className="truncate">
                {item.name}
                <span className="ml-1 text-zinc-500">× {formatShares(b.shares)}</span>
              </span>
              <span className="font-mono shrink-0">{fmt(b.pickedSubtotalCents)}</span>
            </li>
          );
        })}
      </ul>

      <hr className="border-amber-200 dark:border-amber-800" />

      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="font-mono">{fmt(totals.userSubtotalCents)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax</span>
          <span className="font-mono">{fmt(totals.userTaxCents)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tip</span>
          <span className="font-mono">{fmt(totals.userTipCents)}</span>
        </div>
      </div>

      <div className="flex justify-between border-t border-amber-300 pt-2 text-lg font-bold dark:border-amber-700">
        <span>Total</span>
        <span className="font-mono text-amber-700 dark:text-amber-300">
          {fmt(totals.userTotalCents)}
        </span>
      </div>

      <p className="text-center text-[10px] text-zinc-400 dark:text-zinc-600">
        Screenshot to share · billy
      </p>
    </div>
  );
}

function formatShares(shares: number): string {
  if (Number.isInteger(shares)) return String(shares);
  if (shares === 0.25) return "¼";
  if (shares === 0.5) return "½";
  if (shares === 0.75) return "¾";
  if (shares === 1.5) return "1½";
  return shares.toFixed(2);
}
