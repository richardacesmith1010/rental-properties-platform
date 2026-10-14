"use client";

import { useEffect, useRef, useState } from "react";
import { isNativeApp } from "@/lib/native-app";

type Action = "get" | "enable" | "disable";
type Reply = { requestId: string; available: boolean; enabled: boolean; kind: "faceId" | "touchId" | "none" };
type NativeWindow = Window & {
  webkit?: { messageHandlers?: { domusFaceId?: { postMessage: (body: { action: Action; requestId: string }) => void } } };
};

export function FaceIdSettings() {
  const [state, setState] = useState<Reply | null>(null);
  const [supported, setSupported] = useState(false);
  const [pending, setPending] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const latest = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const send = useRef<(action: Action) => void>(() => {});

  useEffect(() => {
    const handler = (window as NativeWindow).webkit?.messageHandlers?.domusFaceId;
    if (!isNativeApp() || !handler) return;
    setSupported(true);
    send.current = (action) => {
      const requestId = crypto.randomUUID();
      latest.current = requestId;
      if (timer.current) clearTimeout(timer.current);
      setPending(true);
      setTimedOut(false);
      timer.current = setTimeout(() => {
        // Expired replies must not change the control after a retry.
        latest.current = null;
        setPending(false);
        setTimedOut(true);
      }, 5000);
      handler.postMessage({ action, requestId });
    };
    const receive = (event: Event) => {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      if (!detail || typeof detail !== "object") return;
      const reply = detail as Partial<Reply>;
      if (!latest.current || reply.requestId !== latest.current
          || typeof reply.available !== "boolean" || typeof reply.enabled !== "boolean"
          || !["faceId", "touchId", "none"].includes(reply.kind ?? "")) return;
      if (timer.current) clearTimeout(timer.current);
      latest.current = null;
      setState(reply as Reply);
      setPending(false);
      setTimedOut(false);
    };
    window.addEventListener("domus-face-id", receive);
    send.current("get");
    return () => {
      window.removeEventListener("domus-face-id", receive);
      if (timer.current) clearTimeout(timer.current);
      latest.current = null;
      send.current = () => {};
    };
  }, []);

  if (!supported || state?.available === false || (!state && !timedOut)) return null;
  const kind = state?.kind === "touchId" ? "Touch ID" : "Face ID";
  const label = `Open Domus with ${kind}`;
  return (
    <div className="domus-card space-y-2 p-4">
      <div className="flex items-center justify-between gap-4">
        <span id="face-id-label" className="text-[var(--ink)]">{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={state?.enabled ?? false}
          aria-labelledby="face-id-label"
          title={label}
          disabled={pending}
          onClick={() => send.current(state ? (state.enabled ? "disable" : "enable") : "get")}
          className="flex min-h-11 min-w-11 items-center rounded-full p-1 disabled:opacity-50"
        >
          <span
            className="flex h-7 w-12 items-center rounded-full p-1"
            style={{ backgroundColor: state?.enabled ? "var(--accent)" : "var(--muted)" }}
          >
            <span
              className={`h-5 w-5 rounded-full bg-[var(--surface)] transition-transform ${state?.enabled ? "translate-x-5" : ""}`}
            />
          </span>
        </button>
      </div>
      {timedOut && <p role="status" className="text-sm text-[var(--ink)]">{kind} didn&apos;t respond. Try again.</p>}
    </div>
  );
}
