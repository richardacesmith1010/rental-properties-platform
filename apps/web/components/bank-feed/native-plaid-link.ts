"use client";

import { useEffect, useState } from "react";

type NativeReply = { status: "success"; publicToken: string; accountIds: string[] }
  | { status: "exit" | "error" };
type NativeWindow = Window & { webkit?: { messageHandlers?: { domusPlaidLink?: {
  postMessage: (body: { action: "open"; requestId: string; linkToken: string }) => void;
} } } };
const handler = () => (window as NativeWindow).webkit?.messageHandlers?.domusPlaidLink;

export function useNativePlaidLink(nativeApp: boolean) {
  const [available, setAvailable] = useState(false);
  useEffect(() => { setAvailable(nativeApp && !!handler()); }, [nativeApp]);
  return available;
}

export function openNativePlaidLink(linkToken: string): Promise<NativeReply> {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const finish = (reply: NativeReply) => {
      clearTimeout(timeout);
      window.removeEventListener("domus-plaid-link", receive);
      resolve(reply);
    };
    const receive = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || detail.requestId !== requestId) return;
      if (detail.status === "exit" || detail.status === "error") finish({ status: detail.status });
      else if (detail.status === "success" && typeof detail.publicToken === "string"
        && Array.isArray(detail.accountIds) && detail.accountIds.every((id: unknown) => typeof id === "string")) {
        finish({ status: "success", publicToken: detail.publicToken, accountIds: detail.accountIds });
      }
    };
    const timeout = setTimeout(() => finish({ status: "exit" }), 30 * 60 * 1000);
    window.addEventListener("domus-plaid-link", receive);
    try {
      const bridge = handler();
      if (!bridge) { finish({ status: "error" }); return; }
      bridge.postMessage({ action: "open", requestId, linkToken });
    } catch { finish({ status: "error" }); }
  });
}
