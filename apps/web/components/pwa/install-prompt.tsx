"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Share2, Smartphone } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DISMISS_KEY = "domus-install-dismissed-until";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface InstallStoreState {
  canInstall: boolean;
  isInstalled: boolean;
  isIos: boolean;
  isMobile: boolean;
  dismissedUntil: number | null;
  ready: boolean;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let installState: InstallStoreState = {
  canInstall: false,
  isInstalled: false,
  isIos: false,
  isMobile: false,
  dismissedUntil: null,
  ready: false
};
const subscribers = new Set<(state: InstallStoreState) => void>();
let listenersRegistered = false;
let serviceWorkerRegistered = false;

function emitInstallState() {
  for (const subscriber of subscribers) {
    subscriber({ ...installState });
  }
}

function updateInstallState(partial: Partial<InstallStoreState>) {
  installState = { ...installState, ...partial };
  emitInstallState();
}

function readDismissedUntil() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(DISMISS_KEY);
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;
  if (Number.isNaN(parsedValue) || parsedValue <= Date.now()) {
    window.localStorage.removeItem(DISMISS_KEY);
    return null;
  }

  return parsedValue;
}

function detectIosInstallSupport() {
  if (typeof window === "undefined") {
    return false;
  }

  const platform = window.navigator.platform ?? "";
  const userAgent = window.navigator.userAgent ?? "";
  return /iphone|ipad|ipod/i.test(userAgent) || (platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

function detectMobileViewport() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 1024;
}

function detectStandaloneMode() {
  if (typeof window === "undefined") {
    return false;
  }

  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

function refreshInstallEnvironment() {
  const isInstalled = detectStandaloneMode();
  const isIos = detectIosInstallSupport();
  const isMobile = detectMobileViewport();
  const dismissedUntil = readDismissedUntil();

  updateInstallState({
    isInstalled,
    isIos,
    isMobile,
    dismissedUntil,
    canInstall: !isInstalled && (Boolean(deferredInstallPrompt) || isIos),
    ready: true
  });
}

function registerServiceWorker() {
  if (serviceWorkerRegistered || typeof window === "undefined" || !("serviceWorker" in window.navigator)) {
    return;
  }

  serviceWorkerRegistered = true;

  const register = () => {
    window.navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((error) => console.error("Failed to register Domus service worker", error));
  };

  if (document.readyState === "complete") {
    register();
    return;
  }

  window.addEventListener("load", register, { once: true });
}

function registerInstallListeners() {
  if (listenersRegistered || typeof window === "undefined") {
    return;
  }

  listenersRegistered = true;
  registerServiceWorker();
  refreshInstallEnvironment();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    refreshInstallEnvironment();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    window.localStorage.removeItem(DISMISS_KEY);
    refreshInstallEnvironment();
  });

  window.addEventListener("resize", refreshInstallEnvironment);
  document.addEventListener("visibilitychange", refreshInstallEnvironment);
}

function dismissInstallPrompt() {
  if (typeof window === "undefined") {
    return;
  }

  const dismissedUntil = Date.now() + DISMISS_DURATION_MS;
  window.localStorage.setItem(DISMISS_KEY, String(dismissedUntil));
  updateInstallState({ dismissedUntil });
}

async function requestInstall() {
  if (!deferredInstallPrompt) {
    refreshInstallEnvironment();
    return "unavailable" as const;
  }

  await deferredInstallPrompt.prompt();
  const result = await deferredInstallPrompt.userChoice.catch(() => null);
  if (result?.outcome === "accepted") {
    deferredInstallPrompt = null;
    refreshInstallEnvironment();
    return "accepted" as const;
  }

  refreshInstallEnvironment();
  return result?.outcome ?? "dismissed";
}

function usePwaInstallState() {
  const [state, setState] = useState<InstallStoreState>(installState);

  useEffect(() => {
    registerInstallListeners();
    refreshInstallEnvironment();

    const listener = (nextState: InstallStoreState) => setState(nextState);
    subscribers.add(listener);
    listener({ ...installState });

    return () => {
      subscribers.delete(listener);
    };
  }, []);

  return {
    ...state,
    dismiss: dismissInstallPrompt,
    promptInstall: requestInstall
  };
}

function IosInstallInstructions() {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
      <li>Open Safari&apos;s Share menu.</li>
      <li>Choose <span className="font-semibold text-foreground">Add to Home Screen</span>.</li>
      <li>Confirm to install Domus in full-screen mode.</li>
    </ol>
  );
}

export function InstallPromptBanner() {
  const { canInstall, dismissedUntil, dismiss, isInstalled, isIos, isMobile, ready, promptInstall } = usePwaInstallState();
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [installing, setInstalling] = useState(false);

  const shouldRender = ready && !isInstalled && isMobile && !dismissedUntil && canInstall;

  if (!shouldRender) {
    return null;
  }

  const handleInstall = async () => {
    if (isIos) {
      setShowIosInstructions((current) => !current);
      return;
    }

    setInstalling(true);
    await promptInstall();
    setInstalling(false);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] px-4">
      <div className="mx-auto max-w-lg pointer-events-auto rounded-2xl border border-border/70 bg-card/95 shadow-xl backdrop-blur">
        <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Install Domus for quick access</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add Domus to your home screen for a full-screen, native-feeling workspace.
            </p>
            {showIosInstructions ? (
              <div className="mt-3 rounded-xl border border-border bg-muted/50 p-3">
                <IosInstallInstructions />
              </div>
            ) : null}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                size="sm"
                onClick={handleInstall}
                loading={installing}
                title={isIos ? "Show Add to Home Screen steps." : "Open the Domus install prompt."}
              >
                {isIos ? <Share2 className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
                {isIos ? "Show install steps" : "Install Domus"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={dismiss}
                title="Hide the Domus install prompt for 7 days."
              >
                Not now
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InstallDomusSettingsCard() {
  const { canInstall, isInstalled, isIos, ready, promptInstall } = usePwaInstallState();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [installing, setInstalling] = useState(false);

  const statusBadge = useMemo(() => {
    if (!ready) {
      return { label: "Checking", variant: "outline" as const };
    }

    if (isInstalled) {
      return { label: "Installed", variant: "success" as const };
    }

    return { label: "Not installed", variant: "outline" as const };
  }, [isInstalled, ready]);

  const handleInstall = async () => {
    setFeedback(null);

    if (isInstalled) {
      setFeedback("Domus is already installed on this device.");
      return;
    }

    if (isIos) {
      setShowIosInstructions((current) => !current);
      return;
    }

    if (!canInstall) {
      setFeedback("This browser has not exposed an install prompt yet. Try opening Domus on a supported mobile browser.");
      return;
    }

    setInstalling(true);
    const result = await promptInstall();
    setInstalling(false);

    if (result === "accepted") {
      setFeedback("Install prompt accepted. Finish the browser flow to add Domus to your device.");
      return;
    }

    if (result === "dismissed") {
      setFeedback("Install prompt dismissed. You can reopen it from Settings any time.");
      return;
    }

    setFeedback("Install prompt is not available on this device yet.");
  };

  return (
    <Card className="border border-border/60 shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold text-foreground">Install Domus App</CardTitle>
          <CardDescription>
            Save Domus to your phone or tablet for home-screen access, splash screen launch, and a standalone app shell.
          </CardDescription>
        </div>
        <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="button"
            onClick={handleInstall}
            loading={installing}
            disabled={ready && isInstalled}
            title={isIos ? "Show iPhone and iPad install instructions." : "Open the Domus install prompt."}
          >
            {isIos ? <Share2 className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
            {isInstalled ? "Installed" : isIos ? "View install steps" : "Install Domus App"}
          </Button>
          <p className="text-sm text-muted-foreground">
            {isInstalled
              ? "Domus is already running as an installed app on this device."
              : isIos
                ? "Safari supports Add to Home Screen instead of a native install prompt."
                : "Supported browsers will offer a native install prompt here when available."}
          </p>
        </div>

        {showIosInstructions ? (
          <Alert variant="info" className="space-y-3 rounded-xl border border-border bg-muted/50 px-4 py-3 text-foreground">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Share2 className="h-4 w-4 text-primary" />
              Add Domus to your iPhone or iPad home screen
            </div>
            <IosInstallInstructions />
          </Alert>
        ) : null}

        {feedback ? (
          <Alert variant="info" className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-foreground">
            {feedback}
          </Alert>
        ) : null}

        {isInstalled ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Standalone mode is active for this device.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
