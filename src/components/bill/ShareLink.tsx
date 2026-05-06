"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

type Props = {
  shareUrl: string;
  size?: number;
};

export function ShareLink({ shareUrl, size = 200 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, shareUrl, {
      width: size,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(() => {
      // QR generation failed; the link copy still works.
    });
  }, [shareUrl, size]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="rounded-lg border bg-white p-3 dark:bg-zinc-100">
        <canvas ref={canvasRef} aria-label="Bill share QR code" />
      </div>
      <div className="w-full space-y-2">
        <div className="rounded-md border bg-zinc-50 p-3 text-center font-mono text-sm break-all dark:bg-zinc-900">
          {shareUrl}
        </div>
        <Button onClick={onCopy} variant="outline" className="w-full">
          {copied ? (
            <>
              <Check aria-hidden="true" className="mr-2 h-4 w-4" />
              Copied
            </>
          ) : (
            <>
              <Copy aria-hidden="true" className="mr-2 h-4 w-4" />
              Copy link
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
