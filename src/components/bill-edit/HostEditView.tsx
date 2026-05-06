"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftIcon, Share2Icon, SaveIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import { ItemEditor, type ItemDraft } from "@/components/bill-edit/ItemEditor";
import { ReconciliationBanner } from "@/components/bill-edit/ReconciliationBanner";
import { TaxField } from "@/components/bill-edit/TaxField";
import { TipPicker, resolveTipCents, type TipState } from "@/components/bill-edit/TipPicker";
import type { BillDto } from "@/lib/dto";
import { formatCents } from "@/lib/utils";

type Props = {
  initialBill: BillDto;
};

type PatchStatus = "SCANNING" | "READY";

type PatchResponse = {
  bill?: BillDto;
  error?: string;
};

function itemsTotal(items: ItemDraft[]): number {
  return items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
}

function billTipToState(bill: BillDto): TipState {
  if (bill.tipInputType === "RECEIPT_GRATUITY") return { type: "RECEIPT_GRATUITY", value: 0 };
  return { type: bill.tipInputType, value: bill.tipInputValue } as TipState;
}

function itemDraftsFromBill(bill: BillDto): ItemDraft[] {
  return bill.items.map((item) => ({
    id: item.id,
    name: item.name,
    unitPriceCents: item.unitPriceCents,
    quantity: item.quantity,
    flagged: item.flagged,
    confidence: item.confidence,
  }));
}

export function HostEditView({ initialBill }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<ItemDraft[]>(() => itemDraftsFromBill(initialBill));
  const [taxCents, setTaxCents] = useState(initialBill.taxCents);
  const [tip, setTip] = useState<TipState>(() => billTipToState(initialBill));
  const [currency] = useState(initialBill.currency);
  const [acceptedMismatch, setAcceptedMismatch] = useState(initialBill.acceptedMismatch);
  const [isSaving, setIsSaving] = useState(false);
  const subtotalCents = useMemo(() => itemsTotal(items), [items]);
  const tipCents = useMemo(() => resolveTipCents(tip, subtotalCents, taxCents), [tip, subtotalCents, taxCents]);
  const totalCents = subtotalCents + taxCents + tipCents;
  const hasBlankItems = items.some((item) => item.name.trim().length === 0);
  const hasItems = items.length > 0;

  const patchBill = async (status: PatchStatus): Promise<BillDto> => {
    if (hasBlankItems) {
      throw new Error("Name every item before saving.");
    }

    const response = await fetch(`/api/bills/${initialBill.shareToken}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((item, position) => ({
          id: item.id,
          name: item.name.trim(),
          unitPriceCents: item.unitPriceCents,
          quantity: item.quantity,
          position,
          confidence: item.confidence,
          flagged: item.flagged,
        })),
        taxCents,
        tip,
        currency,
        status,
        acceptedMismatch,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as PatchResponse;
    if (!response.ok || !data.bill) {
      throw new Error(data.error ?? "Could not save bill.");
    }
    return data.bill;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saved = await patchBill("SCANNING");
      setAcceptedMismatch(saved.acceptedMismatch);
      toast.success("Bill saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save bill.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = async () => {
    setIsSaving(true);
    try {
      await patchBill("READY");
      toast.success("Bill ready to share");
      router.push(`/b/${initialBill.shareToken}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not share bill.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-dvh bg-muted/30 pb-44">
      <Toaster richColors position="top-center" />
      <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button type="button" variant="ghost" size="icon-lg" className="h-11 w-11" onClick={() => router.back()} aria-label="Cancel and go back">
            <ArrowLeftIcon aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Host editor</p>
            <h1 className="truncate text-xl font-semibold tracking-tight">Review your bill</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-5">
        <ReconciliationBanner
          itemsTotalCents={subtotalCents}
          acceptedMismatch={acceptedMismatch}
          onAccept={() => setAcceptedMismatch(true)}
        />
        <ItemEditor initialItems={items} currency={currency} onChange={setItems} />
        <TaxField taxCents={taxCents} currency={currency} onChange={setTaxCents} />
        <TipPicker tip={tip} subtotalCents={subtotalCents} taxCents={taxCents} onChange={setTip} />
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-4 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <div className="mx-auto max-w-2xl space-y-3">
          <div className="grid grid-cols-4 gap-2 text-center text-xs text-muted-foreground">
            <div>
              <div>Subtotal</div>
              <div className="text-sm font-semibold text-foreground">{formatCents(subtotalCents, currency)}</div>
            </div>
            <div>
              <div>Tax</div>
              <div className="text-sm font-semibold text-foreground">{formatCents(taxCents, currency)}</div>
            </div>
            <div>
              <div>Tip</div>
              <div className="text-sm font-semibold text-foreground">{formatCents(tipCents, currency)}</div>
            </div>
            <div>
              <div>Total</div>
              <div className="text-sm font-semibold text-foreground">{formatCents(totalCents, currency)}</div>
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-12 rounded-xl" onClick={handleSave} disabled={isSaving}>
              <SaveIcon aria-hidden="true" />
              Save
            </Button>
            <Button type="button" className="h-12 rounded-xl" onClick={handleShare} disabled={isSaving || !hasItems}>
              <Share2Icon aria-hidden="true" />
              Share with friends
            </Button>
          </div>
          <Button type="button" variant="ghost" className="h-11 w-full rounded-xl" onClick={() => router.back()} disabled={isSaving}>
            Cancel
          </Button>
        </div>
      </footer>
    </div>
  );
}
