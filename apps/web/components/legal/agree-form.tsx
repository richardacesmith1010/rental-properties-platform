"use client";

import { useActionState, useEffect, useState } from "react";
import type { agreeToTerms } from "@/app/actions/legal-acceptance";
import { LEGAL_DOCUMENTS } from "@/lib/legal-versions";
import { LegalAgreementCheckbox } from "./legal-agreement-checkbox";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";

export function AgreeForm({ next, action }: { next: string | null; action: typeof agreeToTerms }) {
  const [state, formAction] = useActionState(action, null);
  const [checked, setChecked] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const error = localError ?? state?.error;
  useEffect(() => { if (state?.error) document.getElementById("agree-box")?.focus(); }, [state]);
  return <form action={formAction} onSubmit={(event) => {
    if (!checked) {
      event.preventDefault();
      setLocalError("Check the box to agree first.");
      document.getElementById("agree-box")?.focus();
    }
  }} className="space-y-4">
    <input type="hidden" name="next" value={next ?? ""} />
    <input type="hidden" name="termsVersion" value={LEGAL_DOCUMENTS.terms.current} />
    <input type="hidden" name="privacyVersion" value={LEGAL_DOCUMENTS.privacy.current} />
    <LegalAgreementCheckbox id="agree-box" checked={checked} onCheckedChange={(value) => {
      setChecked(value); setLocalError(null);
    }} invalid={Boolean(error)} describedBy={error ? "agree-error" : undefined} />
    {error ? <Alert id="agree-error" variant="error" role="alert">{error}</Alert> : null}
    <SubmitButton className="min-h-11 w-full">Continue</SubmitButton>
  </form>;
}
