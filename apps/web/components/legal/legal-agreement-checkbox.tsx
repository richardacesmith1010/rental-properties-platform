"use client";

import { useState } from "react";
import { LegalDocumentSheet } from "./legal-document-sheet";

export function LegalAgreementCheckbox({ id, checked, onCheckedChange, required, invalid, describedBy }: {
  id: string; checked?: boolean; onCheckedChange?: (checked: boolean) => void;
  required?: boolean; invalid?: boolean; describedBy?: string;
}) {
  const [document, setDocument] = useState<"terms" | "privacy" | null>(null);
  return <div className="space-y-2">
    <label htmlFor={id} className="flex min-h-11 items-center gap-3 text-base text-[var(--ink)]">
      <input id={id} name="agree" value="yes" type="checkbox" checked={checked} required={required}
        onChange={(event) => onCheckedChange?.(event.target.checked)} aria-invalid={invalid || undefined}
        aria-describedby={describedBy} className="h-6 w-6 shrink-0 accent-[var(--accent)]" />
      <span>I am 18 or older. I agree to the Terms of Service.</span>
    </label>
    <p className="text-base text-[var(--ink)]">Our Privacy Policy explains how we use your data.</p>
    <div className="flex flex-wrap gap-x-4">
      <button type="button" className="min-h-11 text-[var(--accent)] underline" onClick={() => setDocument("terms")}>
        Read the Terms
      </button>
      <button type="button" className="min-h-11 text-[var(--accent)] underline" onClick={() => setDocument("privacy")}>
        Read the Privacy Policy
      </button>
    </div>
    <LegalDocumentSheet document={document} onClose={() => setDocument(null)} />
  </div>;
}
