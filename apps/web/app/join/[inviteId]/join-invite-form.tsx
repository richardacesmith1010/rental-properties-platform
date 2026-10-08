"use client";

import { useFormState } from "react-dom";
import { useParams } from "next/navigation";
import { resendFromJoinLink } from "@/app/actions/join-invite";
import type { ActionState } from "@/app/actions/shared";
import { SubmitButton } from "@/components/shared/submit-button";

export function JoinInviteForm() {
  const params = useParams<{ inviteId: string }>();
  const [state, action] = useFormState((previous: ActionState, formData: FormData) => {
    formData.set("inviteId", params.inviteId);
    return resendFromJoinLink(previous, formData);
  }, null);
  return (
    <form action={action} className="mt-6 space-y-3">
      <SubmitButton title="Email me a new sign-in link.">Email me a new link</SubmitButton>
      {state ? (
        <p role="status" className={state.success ? "text-[var(--pos)]" : "text-[var(--domus-danger-text)]"}>
          {state.success ? state.message : state.error}
        </p>
      ) : null}
    </form>
  );
}
