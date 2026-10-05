import Link from "next/link";
import { Landmark } from "lucide-react";
import type { OwnerBankCardState } from "@/lib/owner-bank-status";

export function OwnerBankCard({ state }: { state: OwnerBankCardState }) {
  if (state.status === "connected") {
    return null;
  }

  const content = state.status === "needs_info"
    ? {
        title: "Stripe needs one more thing",
        body: "Your bank is almost ready. Answer a few questions so rent can reach you.",
        button: "Finish setup"
      }
    : {
        title: "Connect your bank to get paid",
        body: "Rent can’t reach you until this is done. It takes about 5 minutes.",
        button: "Connect bank"
      };

  return (
    <section className="domus-card flex flex-col gap-4 border-[var(--accent-line)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-weak)] text-[var(--accent)]">
          <Landmark className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-[var(--ink)]">{content.title}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{content.body}</p>
        </div>
      </div>
      <Link
        href={state.href}
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:opacity-90"
        title={content.button}
      >
        {content.button}
      </Link>
    </section>
  );
}
