"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearLinkSession, finishLinkSession, loadLinkSession, type FinishActions } from "./link-session";
import { loadPlaidScript } from "./plaid-script";

// Share an in-flight finish across actual unmount/remount, as well as the ref guard for Strict Mode.
const finishing = new Map<string, ReturnType<typeof finishLinkSession>>();

export function OAuthReturn({ actions }: { actions: FinishActions }) {
  const router = useRouter();
  const initialized = useRef(false);
  const handled = useRef(false);
  const mounted = useRef(false);
  const [message, setMessage] = useState("Finishing your bank connection…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    mounted.current = true;
    const cleanup = () => { mounted.current = false; };
    if (initialized.current) return cleanup;
    initialized.current = true;
    const fail = (error: string) => {
      if (mounted.current) { setMessage(error); setFailed(true); }
    };
    const session = loadLinkSession(Date.now());
    if (!session) { fail("Let's try that again"); return cleanup; }

    const complete = async (pending: ReturnType<typeof finishLinkSession>) => {
      try {
        const result = await pending;
        clearLinkSession();
        if (result.success) { if (mounted.current) router.replace("/owner/bank"); }
        else fail(result.error || "Try again.");
      } catch { clearLinkSession(); fail("Try again."); }
      finally { finishing.delete(session.linkToken); }
    };
    const pending = finishing.get(session.linkToken);
    if (pending) {
      handled.current = true;
      void complete(pending);
      return cleanup;
    }
    void (async () => {
      try {
        await loadPlaidScript();
        if (!mounted.current) return;
        if (!window.Plaid) throw new Error("Plaid Link unavailable.");
        window.Plaid.create({ token: session.linkToken, receivedRedirectUri: window.location.href,
          onSuccess: (publicToken, metadata) => {
            if (handled.current || !mounted.current) return;
            handled.current = true;
            setMessage("Finishing your bank connection…");
            // Defer invocation so synchronous throws also reach complete's catch.
            const pending = Promise.resolve().then(() => finishLinkSession(session, publicToken, metadata, actions));
            finishing.set(session.linkToken, pending);
            void complete(pending);
          },
          onExit: () => {
            if (handled.current || !mounted.current) return;
            handled.current = true;
            clearLinkSession();
            router.replace("/owner/bank");
          }
        }).open();
      } catch {
        if (handled.current) return;
        handled.current = true;
        clearLinkSession(); fail("Try again.");
      }
    })();
    return cleanup;
  }, [actions, router]);

  return <section className="domus-card space-y-4 p-5" aria-live="polite" role={failed ? "alert" : undefined}>
    <h1 className="text-2xl font-bold">{message}</h1>
    {failed ? <Link href="/owner/bank" title="Back to your banks"
      className="inline-flex min-h-11 items-center rounded-full bg-[var(--accent)] px-5 text-[var(--accent-contrast)]">
      Back to your banks</Link> : null}
  </section>;
}
