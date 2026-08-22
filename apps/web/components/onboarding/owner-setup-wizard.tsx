"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { Building2, Copy, Loader2, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ActionState } from "@/app/actions";
import { Alert } from "@/components/ui/alert";

interface OwnerSetupWizardProps {
  onSetupIndividual: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  onSetupLlc: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  onJoinLlc: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}

type SetupMode = "choose" | "individual" | "create_llc" | "join_llc" | "llc_created";

function StatusMessage({ state }: { state: ActionState }) {
  if (!state) {
    return null;
  }

  if (state.success) {
    return (
      <Alert variant="success">
        Setup saved successfully.
      </Alert>
    );
  }

  return (
    <Alert variant="error">
      {state.error}
    </Alert>
  );
}

function ChoiceCard({
  icon,
  title,
  description,
  onClick
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Choose ${title}.`}
      className="flex flex-col items-center rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center shadow-[var(--domus-shadow-sm)] transition hover:-translate-y-0.5 hover:border-[var(--accent-line)] hover:bg-[var(--surface-2)] hover:shadow-[var(--domus-shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ground)]"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-weak)] text-[var(--accent)]">
        {icon}
      </div>
      <h2 className="text-base font-semibold text-[var(--ink)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>
    </button>
  );
}

export function OwnerSetupWizard({
  onSetupIndividual,
  onSetupLlc,
  onJoinLlc
}: OwnerSetupWizardProps) {
  const [mode, setMode] = useState<SetupMode>("choose");
  const [llcDisplayName, setLlcDisplayName] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [individualPending, setIndividualPending] = useState(false);
  const [createdLlc, setCreatedLlc] = useState<{ joinCode: string; accountId: string } | null>(null);
  const individualFormRef = useRef<HTMLFormElement>(null);
  const [individualState, individualAction] = useFormState(onSetupIndividual, null);
  const [llcState, llcAction] = useFormState(onSetupLlc, null);
  const [joinState, joinAction] = useFormState(onJoinLlc, null);

  useEffect(() => {
    if (mode === "individual") {
      setIndividualPending(true);
      individualFormRef.current?.requestSubmit();
    }
  }, [mode]);

  useEffect(() => {
    if (!individualState) {
      return;
    }

    if (individualState.success) {
      window.location.href = "/owner";
      return;
    }

    setIndividualPending(false);
  }, [individualState]);

  useEffect(() => {
    if (llcState?.success && llcState.joinCode && llcState.accountId) {
      setCreatedLlc({
        joinCode: llcState.joinCode,
        accountId: llcState.accountId
      });
      setMode("llc_created");
    }
  }, [llcState]);

  useEffect(() => {
    if (joinState?.success) {
      window.location.href = "/owner";
    }
  }, [joinState]);

  return (
    <div className="w-full max-w-4xl">
      {mode === "choose" && (
        <div className="grid gap-4 md:grid-cols-3">
          <ChoiceCard
            icon={<User className="h-7 w-7" />}
            title="Individual Landlord"
            description="I manage properties on my own."
            onClick={() => setMode("individual")}
          />
          <ChoiceCard
            icon={<Building2 className="h-7 w-7" />}
            title="Create LLC"
            description="I'm setting up an LLC with other owners."
            onClick={() => setMode("create_llc")}
          />
          <ChoiceCard
            icon={<Users className="h-7 w-7" />}
            title="Join Existing LLC"
            description="Someone shared a join code with me."
            onClick={() => setMode("join_llc")}
          />
        </div>
      )}

      {mode === "individual" && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 shadow-[var(--domus-shadow-sm)]">
          <form ref={individualFormRef} action={individualAction}>
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-weak)] text-[var(--accent)]">
                <Loader2 className={`h-7 w-7 ${individualPending ? "animate-spin" : ""}`} />
              </div>
              <h2 className="text-xl font-semibold text-[var(--ink)]">Creating your individual account</h2>
              <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
                Domus is preparing your owner account now. This should only take a moment.
              </p>
              {individualState && !individualState.success && (
                <div className="mt-4 w-full max-w-md">
                  <StatusMessage state={individualState} />
                </div>
              )}
              <div className="mt-6 flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMode("choose");
                    setIndividualPending(false);
                  }}
                  title="Return to the ownership setup options."
                >
                  Back
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}

      {mode === "create_llc" && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 shadow-[var(--domus-shadow-sm)]">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-[var(--ink)]">Create your LLC</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Give your LLC account a name that you and the other owners will recognize.
            </p>
          </div>
          <form action={llcAction} className="space-y-4">
            <div>
              <label htmlFor="llc-display-name" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                LLC Display Name
              </label>
              <Input
                id="llc-display-name"
                name="displayName"
                value={llcDisplayName}
                onChange={(event) => setLlcDisplayName(event.target.value)}
                placeholder="Example: Smith Family Holdings LLC"
                required
              />
            </div>
            <StatusMessage state={llcState} />
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMode("choose")}
                title="Return to the ownership setup options."
              >
                Back
              </Button>
              <SubmitButton title="Create this LLC account.">
                Create LLC
              </SubmitButton>
            </div>
          </form>
        </div>
      )}

      {mode === "join_llc" && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 shadow-[var(--domus-shadow-sm)]">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-[var(--ink)]">Join an existing LLC</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Enter the 6-character join code that another LLC member shared with you.
            </p>
          </div>
          <form action={joinAction} className="space-y-4">
            <div>
              <label htmlFor="llc-join-code" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                Join Code
              </label>
              <Input
                id="llc-join-code"
                name="joinCode"
                value={joinCodeInput}
                onChange={(event) => setJoinCodeInput(event.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                required
              />
            </div>
            <StatusMessage state={joinState} />
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMode("choose")}
                title="Return to the ownership setup options."
              >
                Back
              </Button>
              <SubmitButton title="Join this LLC account.">
                Join LLC
              </SubmitButton>
            </div>
          </form>
        </div>
      )}

      {mode === "llc_created" && createdLlc && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 shadow-[var(--domus-shadow-sm)]">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-[var(--ink)]">Your LLC is ready</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Share this join code with your LLC members so they can join your account.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Join Code</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="tabular-nums text-3xl font-bold tracking-[0.35em] text-[var(--ink)]">
                {createdLlc.joinCode}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(createdLlc.joinCode);
                  setCopied(true);
                }}
                title="Copy this join code."
              >
                <Copy className="mr-2 h-4 w-4" />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="mt-3 text-xs tabular-nums text-[var(--muted)]">Account ID: {createdLlc.accountId}</p>
          </div>
          <div className="mt-6 flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMode("choose")}
              title="Go back to the setup options."
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={() => {
                window.location.href = "/owner";
              }}
              title="Continue into the owner dashboard."
            >
              Continue to Dashboard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
