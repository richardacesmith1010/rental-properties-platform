"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircleMore } from "lucide-react";
import type { StatefulAction } from "@/app/actions";
import { FeedbackModal } from "@/components/feedback/feedback-modal";
import { createClient } from "@/lib/supabase/client";

interface FeedbackButtonProps {
  onSubmit: StatefulAction;
  onOpen?: () => void;
}

export function FeedbackButton({ onSubmit, onOpen }: FeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    let isMounted = true;

    try {
      const supabase = createClient();

      void supabase.auth.getUser().then(({ data }) => {
        if (!isMounted) {
          return;
        }
        setEmail(data.user?.email ?? "");
      });

      const {
        data: { subscription }
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!isMounted) {
          return;
        }
        setEmail(session?.user?.email ?? "");
      });

      return () => {
        isMounted = false;
        subscription.unsubscribe();
      };
    } catch (error) {
      console.error("FeedbackButton auth sync error:", error);
      return () => {
        isMounted = false;
      };
    }
  }, []);

  return (
    <>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onOpen?.();
          setOpen(true);
        }}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--ink-2)] transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)]"
        title="Send feedback to the Domus team."
      >
        <MessageCircleMore className="h-4 w-4" />
        <span>Send feedback</span>
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <FeedbackModal
              open
              onClose={() => setOpen(false)}
              onSubmit={onSubmit}
              defaultEmail={email}
            />,
            document.body
          )
        : null}
    </>
  );
}
