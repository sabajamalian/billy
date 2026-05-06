"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type Props = { shareToken: string };

/**
 * Shown to guests when the bill is still in SCANNING state (host hasn't shared yet).
 * Polls the bill every 4s and auto-redirects (via router.refresh) when status becomes READY.
 */
export function ScanningPlaceholder({ shareToken }: Props) {
  const router = useRouter();
  const [dots, setDots] = useState(".");

  useEffect(() => {
    const dotsTimer = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 500);
    return () => clearInterval(dotsTimer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/bills/${shareToken}`, { cache: "no-store" });
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { bill: { status: string } };
          if (data.bill.status === "READY") {
            router.refresh();
          }
        }
      } catch {
        // ignore; will retry
      }
    };
    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [shareToken, router]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-zinc-50 p-6 text-center dark:bg-zinc-950">
      <Loader2 aria-hidden="true" className="h-12 w-12 animate-spin text-amber-500" />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Hang tight{dots}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          The host is still preparing this bill. We&apos;ll show items as soon as they&apos;re ready.
        </p>
      </div>
    </main>
  );
}
