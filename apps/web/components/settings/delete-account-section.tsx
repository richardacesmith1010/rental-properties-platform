"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { requestAccountDeletion } from "@/app/actions/account-deletion-request";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function DeleteAccountButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="destructive" title="Ask us to delete your account."
    disabled={pending || !ready}>
    {pending ? "Sending…" : "Delete my account"}
  </Button>;
}

export function DeleteAccountSection() {
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction] = useFormState(requestAccountDeletion, null);

  return <Card className="border shadow-sm" style={{
    backgroundColor: "var(--domus-danger-bg)", borderColor: "var(--domus-danger-text)"
  }}>
    <CardHeader>
      <CardTitle style={{ color: "var(--domus-danger-text)" }}>Delete my account</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4" style={{ color: "var(--domus-danger-text)" }}>
      <p>We will delete your account within 30 days.</p>
      <p>We may keep rent and payment records, without your name.</p>
      <form action={formAction} className="space-y-3">
        <label htmlFor="delete-account-confirmation" className="block text-sm font-semibold">
          Type DELETE to confirm
        </label>
        <Input id="delete-account-confirmation" name="confirmation" value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)} placeholder="DELETE"
          autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false}
          style={{ backgroundColor: "var(--domus-input-bg)", borderColor: "var(--domus-input-border)",
            color: "var(--domus-heading-text)" }} />
        {state && !state.success ? <Alert variant="error" role="alert">{state.error}</Alert> : null}
        <DeleteAccountButton ready={confirmation === "DELETE"} />
      </form>
    </CardContent>
  </Card>;
}
