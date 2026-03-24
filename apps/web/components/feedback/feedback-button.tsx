"use client";

import { useEffect, useState } from "react";
import { MessageCircleMore } from "lucide-react";
import type { StatefulAction } from "@/app/actions";
import { FeedbackModal } from "@/components/feedback/feedback-modal";
import { createClient } from "@/lib/supabase/client";

interface FeedbackButtonProps {
  onSubmit: StatefulAction;
}

export function FeedbackButton({ onSubmit }: FeedbackButtonProps) {
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
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-40 inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-full bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-violet-700 hover:shadow-xl sm:bottom-6 sm:right-6"
          title="Send feedback to the Domus team."
          aria-label="Send feedback"
        >
          <MessageCircleMore className="h-5 w-5" />
          <span className="hidden sm:inline">Feedback</span>
        </button>
      ) : null}

      <FeedbackModal
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={onSubmit}
        defaultEmail={email}
      />
    </>
  );
}
