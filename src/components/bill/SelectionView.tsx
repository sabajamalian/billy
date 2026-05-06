"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2Icon, PencilIcon, QrCodeIcon, UserRoundIcon } from "lucide-react";

import { NicknameDialog } from "@/components/bill/NicknameDialog";
import { SelectionRow } from "@/components/bill/SelectionRow";
import { StickyTotalBar } from "@/components/bill/StickyTotalBar";
import { ExportShareDialog } from "@/components/bill/ExportShareDialog";
import { ShareLink } from "@/components/bill/ShareLink";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { BillDto } from "@/lib/dto";
import { useBillSelections, usePruneStaleForBill, useSetShares } from "@/lib/store/selections";
import { useBillSse } from "@/lib/use-bill-sse";

type Props = {
  initialBill: BillDto;
  isHost: boolean;
};

type BillResponse = {
  bill: BillDto;
  isHost: boolean;
};

export function SelectionView({ initialBill, isHost }: Props) {
  const [bill, setBill] = useState(initialBill);
  const [expired, setExpired] = useState(false);
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const { selections, nickname } = useBillSelections(bill.id);
  const setShares = useSetShares();
  const pruneStaleForBill = usePruneStaleForBill();

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/bills/${encodeURIComponent(bill.shareToken)}`, { cache: "no-store" });
    if (res.status === 410) {
      setExpired(true);
      return bill.version;
    }
    if (!res.ok) return bill.version;

    const data = (await res.json()) as BillResponse;
    setBill(data.bill);
    return data.bill.version;
  }, [bill.shareToken, bill.version]);

  const fetchVersion = useCallback(
    async (shareToken: string) => {
      const res = await fetch(`/api/bills/${encodeURIComponent(shareToken)}`, { cache: "no-store" });
      if (res.status === 410) {
        setExpired(true);
        return bill.version;
      }
      if (!res.ok) throw new Error(`Failed to fetch bill: ${res.status}`);
      const data = (await res.json()) as BillResponse;
      return data.bill.version;
    },
    [bill.version],
  );

  useBillSse({
    shareToken: bill.shareToken,
    fetchVersion,
    onUpdate: () => {
      void refetch();
    },
    onDeleted: () => setExpired(true),
  });

  const itemIds = useMemo(() => bill.items.map((item) => item.id), [bill.items]);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/b/${bill.shareToken}`;
  }, [bill.shareToken]);

  useEffect(() => {
    pruneStaleForBill(bill.id, itemIds);
  }, [bill.id, itemIds, pruneStaleForBill]);

  if (expired) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-2xl place-items-center px-4 text-center">
        <div className="grid gap-3">
          <h1 className="text-2xl font-bold">This bill has expired</h1>
          <p className="text-muted-foreground">Ask the host to scan or share a new bill.</p>
        </div>
      </main>
    );
  }

  if (bill.status === "SCANNING" && !isHost) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-2xl place-items-center px-4 text-center">
        <div className="grid gap-4 rounded-2xl border bg-card p-6 shadow-sm">
          <Loader2Icon className="mx-auto size-10 animate-spin text-primary" aria-hidden="true" />
          <div className="grid gap-2">
            <h1 className="text-2xl font-bold">The host is still preparing this bill</h1>
            <p className="text-muted-foreground">Hang tight — your item list will appear here automatically.</p>
          </div>
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 pb-36 pt-5">
      <header className="mb-5 grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-primary">Billy</p>
            <h1 className="text-3xl font-bold tracking-tight">Pick what you had</h1>
          </div>
          {isHost && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setQrOpen(true)}
              >
                <QrCodeIcon aria-hidden="true" /> Share link
              </Button>
              <Button variant="outline" className="min-h-11" render={<Link href={`/b/${bill.shareToken}/edit`} />}>
                <PencilIcon aria-hidden="true" /> Edit bill
              </Button>
            </div>
          )}
        </div>
        <Button type="button" variant="outline" className="min-h-11 justify-start" onClick={() => setNicknameOpen(true)}>
          <UserRoundIcon aria-hidden="true" /> {nickname ? `You: ${nickname}` : "Set my name"}
        </Button>
      </header>

      <section aria-label="Bill items" className="grid gap-3">
        {bill.items.map((item) => (
          <SelectionRow
            key={item.id}
            item={item}
            shares={selections[item.id] ?? 0}
            currency={bill.currency}
            onSharesChange={(next) => setShares(bill.id, item.id, next)}
          />
        ))}
      </section>

      <NicknameDialog billId={bill.id} nickname={nickname} open={nicknameOpen} onOpenChange={setNicknameOpen} />
      <ExportShareDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        bill={bill}
        selections={selections}
        nickname={nickname || undefined}
      />
      {isHost && (
        <Dialog open={qrOpen} onOpenChange={setQrOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Share with friends</DialogTitle>
            </DialogHeader>
            <ShareLink shareUrl={shareUrl} />
          </DialogContent>
        </Dialog>
      )}
      <StickyTotalBar bill={bill} selections={selections} onShareClick={() => setExportOpen(true)} />
    </main>
  );
}
