"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ActionState } from "@/app/actions";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface PlaidLinkButtonProps {
  accountId: string;
  onInitiatePlaidLink: StatefulAction;
  onCompletePlaidLink: StatefulAction;
}

interface PlaidAccountMetadata {
  id?: string;
  name?: string;
  mask?: string | null;
}

interface PlaidSuccessMetadata {
  institution?: {
    name?: string | null;
  } | null;
  accounts?: PlaidAccountMetadata[];
}

interface PlaidHandler {
  open: () => void;
  destroy?: () => void;
}

interface PlaidWindow {
  Plaid?: {
    create: (config: {
      token: string;
      onSuccess: (publicToken: string, metadata: PlaidSuccessMetadata) => void;
      onExit?: (error: { display_message?: string | null } | null) => void;
    }) => PlaidHandler;
  };
}

declare global {
  interface Window extends PlaidWindow {}
}

let plaidScriptPromise: Promise<void> | null = null;

function loadPlaidScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Plaid Link can only be opened in the browser."));
  }

  if (window.Plaid) {
    return Promise.resolve();
  }

  if (!plaidScriptPromise) {
    plaidScriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-plaid-link="true"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Failed to load Plaid Link.")), {
          once: true
        });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
      script.async = true;
      script.dataset.plaidLink = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Plaid Link."));
      document.head.appendChild(script);
    });
  }

  return plaidScriptPromise;
}

export function PlaidLinkButton({
  accountId,
  onInitiatePlaidLink,
  onCompletePlaidLink
}: PlaidLinkButtonProps) {
  const [initiateState, initiateAction] = useFormState(onInitiatePlaidLink, null);
  const [completeState, completeAction] = useFormState(onCompletePlaidLink, null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [completionPayload, setCompletionPayload] = useState<{
    publicToken: string;
    plaidAccountId: string;
    bankName: string;
    bankMask: string;
  } | null>(null);
  const [openingPlaid, setOpeningPlaid] = useState(false);
  const completeFormRef = useRef<HTMLFormElement | null>(null);
  const openedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const linkToken = initiateState?.success && initiateState.message ? initiateState.message : null;
    if (!linkToken || openedTokenRef.current === linkToken) {
      return;
    }

    openedTokenRef.current = linkToken;
    setLocalError(null);
    setOpeningPlaid(true);

    void loadPlaidScript()
      .then(() => {
        if (!window.Plaid) {
          throw new Error("Plaid Link failed to initialize.");
        }

        const handler = window.Plaid.create({
          token: linkToken,
          onSuccess: (publicToken, metadata) => {
            const selectedAccount = metadata.accounts?.[0];
            if (!selectedAccount?.id) {
              setLocalError("Plaid did not return a bank account to connect.");
              setOpeningPlaid(false);
              return;
            }

            setCompletionPayload({
              publicToken,
              plaidAccountId: selectedAccount.id,
              bankName: metadata.institution?.name ?? selectedAccount.name ?? "Connected bank",
              bankMask: selectedAccount.mask ?? ""
            });
            setOpeningPlaid(false);
            handler.destroy?.();
          },
          onExit: (error) => {
            if (error?.display_message) {
              setLocalError(error.display_message);
            }
            setOpeningPlaid(false);
            handler.destroy?.();
          }
        });

        handler.open();
      })
      .catch((error: unknown) => {
        setLocalError(error instanceof Error ? error.message : "Unable to open Plaid Link.");
        setOpeningPlaid(false);
      });
  }, [initiateState]);

  useEffect(() => {
    if (!completionPayload || !completeFormRef.current) {
      return;
    }

    completeFormRef.current.requestSubmit();
  }, [completionPayload]);

  useEffect(() => {
    if (!completeState?.success) {
      return;
    }

    setCompletionPayload(null);
    setLocalError(null);
  }, [completeState]);

  return (
    <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50/70 px-4 py-4">
      <p className="text-sm font-medium text-zinc-800">Connect this LLC bank account with Plaid.</p>
      <p className="mt-1 text-xs text-zinc-500">
        Link a bank account to surface its balance inside the ownership dashboard.
      </p>

      <form action={initiateAction} className="mt-3">
        <input type="hidden" name="accountId" value={accountId} />
        <SubmitButton
          variant="outline"
          disabled={openingPlaid || Boolean(completionPayload)}
          title="Connect a bank account with Plaid."
        >
          {openingPlaid ? "Opening Plaid..." : "Connect Bank Account"}
        </SubmitButton>
      </form>

      <form action={completeAction} ref={completeFormRef} className="hidden">
        <input type="hidden" name="accountId" value={accountId} />
        <input type="hidden" name="publicToken" value={completionPayload?.publicToken ?? ""} readOnly />
        <input type="hidden" name="plaidAccountId" value={completionPayload?.plaidAccountId ?? ""} readOnly />
        <input type="hidden" name="bankName" value={completionPayload?.bankName ?? ""} readOnly />
        <input type="hidden" name="bankMask" value={completionPayload?.bankMask ?? ""} readOnly />
      </form>

      {initiateState && !initiateState.success ? (
        <Alert variant="error" className="mt-3 text-xs font-normal">
          {initiateState.error}
        </Alert>
      ) : null}
      {localError ? (
        <Alert variant="error" className="mt-3 text-xs font-normal">
          {localError}
        </Alert>
      ) : null}
      {completeState && !completeState.success ? (
        <Alert variant="error" className="mt-3 text-xs font-normal">
          {completeState.error}
        </Alert>
      ) : null}
      {completeState?.success && completeState.message ? (
        <Alert variant="success" className="mt-3 text-xs font-normal">
          {completeState.message}
        </Alert>
      ) : null}
    </div>
  );
}
