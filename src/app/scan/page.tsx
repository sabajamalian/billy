import { ScanUploader } from "@/components/scan/ScanUploader";

export default function ScanPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 py-8 dark:bg-black">
      <div className="w-full max-w-md">
        <ScanUploader />
      </div>
    </main>
  );
}
