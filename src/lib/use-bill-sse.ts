"use client";

import { useEffect, useRef, useState } from "react";

export type BillSseStatus = "idle" | "connecting" | "open" | "polling" | "error";

export type UseBillSseResult = {
  status: BillSseStatus;
  version: number | null;
  lastEventAt: number | null;
};

export type UseBillSseOptions = {
  shareToken: string;
  onUpdate?: (version: number) => void;
  onDeleted?: () => void;
  pollIntervalMs?: number;
  fetchVersion?: (shareToken: string) => Promise<number>;
};

type BillSseMessage = {
  type?: string;
  version?: number;
  at?: number;
};

const defaultFetchVersion = async (shareToken: string): Promise<number> => {
  const res = await fetch(`/api/bills/${encodeURIComponent(shareToken)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to fetch bill version: ${res.status}`);

  const data: unknown = await res.json();
  if (
    typeof data === "object" &&
    data !== null &&
    "version" in data &&
    typeof data.version === "number"
  ) {
    return data.version;
  }
  if (
    typeof data === "object" &&
    data !== null &&
    "bill" in data &&
    typeof data.bill === "object" &&
    data.bill !== null &&
    "version" in data.bill &&
    typeof data.bill.version === "number"
  ) {
    return data.bill.version;
  }

  throw new Error("Bill version missing from response");
};

const parseMessage = (event: MessageEvent<string>): BillSseMessage | null => {
  try {
    const parsed: unknown = JSON.parse(event.data);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
};

export function useBillSse(opts: UseBillSseOptions): UseBillSseResult {
  const { shareToken, onUpdate, onDeleted, pollIntervalMs = 5_000, fetchVersion = defaultFetchVersion } = opts;
  const [status, setStatus] = useState<BillSseStatus>("idle");
  const [version, setVersion] = useState<number | null>(null);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const versionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!shareToken) {
      setStatus("idle");
      setVersion(null);
      setLastEventAt(null);
      versionRef.current = null;
      return;
    }

    let poll: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const stopPolling = () => {
      if (!poll) return;
      clearInterval(poll);
      poll = null;
    };

    const pollOnce = async () => {
      try {
        const nextVersion = await fetchVersion(shareToken);
        if (closed) return;
        setVersion(nextVersion);
        setLastEventAt(Date.now());
        if (versionRef.current !== null && nextVersion > versionRef.current) {
          onUpdate?.(nextVersion);
        }
        versionRef.current = nextVersion;
      } catch {
        if (!closed) setStatus("polling");
      }
    };

    const startPolling = () => {
      if (poll) return;
      setStatus("polling");
      void pollOnce();
      poll = setInterval(() => {
        void pollOnce();
      }, pollIntervalMs);
    };

    const applyVersion = (nextVersion: number) => {
      versionRef.current = nextVersion;
      setVersion(nextVersion);
    };

    const handleMessage = (event: MessageEvent<string>, shouldNotify: boolean) => {
      const data = parseMessage(event);
      if (!data) return;

      setLastEventAt(typeof data.at === "number" ? data.at : Date.now());
      if (typeof data.version === "number") {
        applyVersion(data.version);
        if (shouldNotify) onUpdate?.(data.version);
      }
    };

    setStatus("connecting");
    const source = new EventSource(`/api/bills/${encodeURIComponent(shareToken)}/events`);

    source.addEventListener("open", () => {
      stopPolling();
      setStatus("open");
    });

    source.addEventListener("hello", (event) => {
      handleMessage(event as MessageEvent<string>, false);
    });

    source.addEventListener("bill.updated", (event) => {
      handleMessage(event as MessageEvent<string>, true);
    });

    source.addEventListener("bill.deleted", (event) => {
      const data = parseMessage(event as MessageEvent<string>);
      setLastEventAt(typeof data?.at === "number" ? data.at : Date.now());
      onDeleted?.();
    });

    source.addEventListener("error", () => {
      if (closed) return;
      setStatus("error");
      startPolling();
    });

    return () => {
      closed = true;
      stopPolling();
      source.close();
    };
  }, [shareToken, onUpdate, onDeleted, pollIntervalMs, fetchVersion]);

  return { status, version, lastEventAt };
}
