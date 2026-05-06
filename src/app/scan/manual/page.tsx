"use client";

import { useEffect, useRef, useState } from "react";

import { HostEditView } from "@/components/bill-edit/HostEditView";
import type { BillDto } from "@/lib/dto";

type CreateBillResponse = {
  bill?: BillDto;
  error?: string;
};

export default function ManualBillPage() {
  const [bill, setBill] = useState<BillDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const createBill = async () => {
      try {
        const response = await fetch("/api/bills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = (await response.json().catch(() => ({}))) as CreateBillResponse;
        if (!response.ok || !data.bill) {
          throw new Error(data.error ?? "Could not create bill.");
        }
        setBill(data.bill);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not create bill.");
      }
    };

    void createBill();
  }, []);

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-6">
        <div className="max-w-sm rounded-2xl border bg-card p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Could not create bill</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
      </main>
    );
  }

  if (!bill) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-6">
        <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Creating bill...</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your manual entry form will be ready in a moment.</p>
        </div>
      </main>
    );
  }

  return <HostEditView initialBill={bill} />;
}
