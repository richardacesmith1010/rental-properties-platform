"use client";

import { useRef, useState } from "react";

interface AskDomusSettingsProps {
  initialEnabled: boolean;
  onSetConsent: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
}

export function AskDomusSettings({ initialEnabled, onSetConsent }: AskDomusSettingsProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);

  async function changeConsent() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await onSetConsent(!enabled);
      if (result.success) setEnabled(!enabled);
      else setError(result.error ?? "We could not save this. Please try again.");
    } catch {
      setError("We could not save this. Please try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <div className="space-y-3">
    <button type="button" role="switch" aria-checked={enabled} disabled={saving} onClick={() => void changeConsent()}
      className="flex min-h-11 w-full items-center justify-between gap-4 rounded-xl border border-[var(--line)]
        bg-[var(--surface)] px-4 py-3 text-left text-sm text-[var(--ink)]">
      <span>Let Ask Domus answer my questions</span>
      <span aria-hidden="true" className={`h-6 w-11 rounded-full p-1 ${enabled ? "bg-[var(--action)]" : "bg-[var(--muted)]"}`}>
        <span className={`block h-4 w-4 rounded-full bg-[var(--surface)] transition-transform
          ${enabled ? "translate-x-5" : ""}`} />
      </span>
    </button>
    <p className="text-sm text-[var(--ink-2)]">Your questions and rental details go to Anthropic.</p>
    {error ? <p role="alert" className="text-sm text-[var(--crit)]">{error}</p> : null}
  </div>;
}
