"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/app/actions";
import { Alert } from "@/components/ui/alert";

export function FieldLabel({
  htmlFor,
  children,
  required = false,
}: {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium domus-heading">
      {children}
      {required && <span className="ml-1 text-red-500">*</span>}
    </label>
  );
}

export function FormError({ state }: { state: ActionState }) {
  const handledRef = useRef<ActionState>(null);

  useEffect(() => {
    if (!state || state.success || !state.error) return;
    if (handledRef.current === state) return;
    handledRef.current = state;
    toast.error(state.error);
  }, [state]);

  return (
    <div className="domus-error-reveal" data-visible={Boolean(state && !state.success && state.error)}>
      {state && !state.success && state.error ? (
        <Alert variant="error">{state.error}</Alert>
      ) : null}
    </div>
  );
}

export function FormSuccess({ state, message = "Saved successfully!" }: { state: ActionState; message?: string }) {
  const handledRef = useRef<ActionState>(null);

  useEffect(() => {
    if (!state?.success) return;
    if (handledRef.current === state) return;
    handledRef.current = state;
    toast.success(state.message ?? message);
  }, [message, state]);

  return (
    <div className="domus-error-reveal" data-visible={Boolean(state?.success)}>
      {state?.success ? (
        <Alert variant="success">{state.message ?? message}</Alert>
      ) : null}
    </div>
  );
}
