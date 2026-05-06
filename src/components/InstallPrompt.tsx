"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

const INSTALL_DISMISSED_KEY = "billy:install-dismissed";

export function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIosPrompt, setShowIosPrompt] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
    const nav = window.navigator as NavigatorWithStandalone;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isIosBrowser = isIos && nav.standalone === false;

    if (!dismissed && isIosBrowser) {
      setShowIosPrompt(true);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();

      if (localStorage.getItem(INSTALL_DISMISSED_KEY) === "1") {
        return;
      }

      setInstallEvent(event as BeforeInstallPromptEvent);
      setShowIosPrompt(false);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const hide = () => {
    setShowPrompt(false);
    setShowIosPrompt(false);
  };

  const dismiss = () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    hide();
  };

  const install = async () => {
    if (!installEvent) {
      return;
    }

    try {
      await installEvent.prompt();
      await installEvent.userChoice;
    } finally {
      setInstallEvent(null);
      hide();
    }
  };

  if (!showPrompt && !showIosPrompt) {
    return null;
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-zinc-200 bg-white/95 p-3 text-left shadow-lg shadow-zinc-950/10 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 dark:shadow-black/30">
      <p className="min-w-0 flex-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {showIosPrompt ? "Tap Share → Add to Home Screen" : "Install Billy for quick access"}
      </p>
      {showPrompt ? (
        <Button size="sm" onClick={install}>
          Install
        </Button>
      ) : null}
      <Button
        aria-label="Dismiss install prompt"
        className="shrink-0"
        size="icon-sm"
        variant="ghost"
        onClick={dismiss}
      >
        X
      </Button>
    </div>
  );
}
