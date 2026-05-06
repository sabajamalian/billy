import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Receipt, Camera, PenLine } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-between bg-gradient-to-b from-amber-50 via-white to-white p-6 dark:from-amber-950/20 dark:via-zinc-950 dark:to-zinc-950">
      <header className="flex w-full max-w-md items-center justify-center pt-8">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
          <Receipt aria-hidden="true" className="h-7 w-7" />
          <span className="text-2xl font-bold tracking-tight">Billy</span>
        </div>
      </header>

      <section className="flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 py-10 text-center">
        <div className="space-y-3">
          <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Split the bill,
            <br />
            <span className="text-amber-600 dark:text-amber-400">no math required.</span>
          </h1>
          <p className="text-balance text-base text-zinc-600 dark:text-zinc-400">
            Snap a photo of the receipt. Each friend taps what they had. Everyone&apos;s share is
            calculated instantly — tax and tip included.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Link
            href="/scan"
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-14 text-base",
            )}
          >
            <Camera aria-hidden="true" className="mr-2 h-5 w-5" />
            Scan a receipt
          </Link>
          <Link
            href="/scan/manual"
            className={cn(
              buttonVariants({ size: "lg", variant: "outline" }),
              "h-14 text-base",
            )}
          >
            <PenLine aria-hidden="true" className="mr-2 h-5 w-5" />
            Enter items manually
          </Link>
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          No account needed. Bills auto-expire after 7 days.
        </p>
      </section>

      <footer className="w-full max-w-md py-4 text-center text-xs text-zinc-400 dark:text-zinc-600">
        Built with care · self-hostable
      </footer>
    </main>
  );
}
