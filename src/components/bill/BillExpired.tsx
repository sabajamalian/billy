import Link from "next/link";
import { Receipt, Clock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BillExpired() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-zinc-50 p-6 text-center dark:bg-zinc-950">
      <Clock aria-hidden="true" className="h-16 w-16 text-amber-500" />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Bill has expired</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Bills auto-expire after 7 days to keep things tidy.
        </p>
      </div>
      <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
        <Receipt aria-hidden="true" className="mr-2 h-4 w-4" />
        Start a new bill
      </Link>
    </main>
  );
}
