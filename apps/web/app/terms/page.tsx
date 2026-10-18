import type { Metadata } from "next";
import { LandingShell } from "@/components/marketing/landing-shell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Domus terms of service for use of the rental operations platform.",
};

export default function TermsPage() {
  return (
    <LandingShell>
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 pb-16 pt-10 md:px-10">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">Terms of Service</h1>
          <p className="text-sm text-[var(--faint)]">Last updated: October 18, 2026</p>
          <p className="rounded-xl border border-[var(--warn)] bg-[var(--warn-bg)] px-4 py-3 text-sm text-[var(--warn)]">
            Early access version. A lawyer is reviewing these terms. We will tell you before a final version takes effect.
          </p>
        </header>

        <section className="space-y-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6
          text-sm leading-7 text-[var(--faint)]">
          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">Who we are</h2>
            <p>Domus (&quot;we&quot;) is run by Richard Smith, an individual. You can reach us at support@domusbase.com.</p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">What Domus does</h2>
            <p>Domus helps landlords, property managers, and tenants handle rent, repairs, leases, documents, and messages in one place.</p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">Your account</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Keep your sign-in details safe. You are responsible for what happens in your account.</li>
              <li>Give true, current information.</li>
              <li>Only add homes, tenants, or managers you have the right to manage.</li>
            </ul>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">Early access and price</h2>
            <p>
              Domus is free while it is in early access. We will tell you at least 30 days before we start charging. You can stop
              using Domus before any charge starts.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">Payments</h2>
            <p>
              Online rent payments are handled by Stripe. Stripe&apos;s terms apply to those payments. Domus does not hold your
              money. Fees shown before you pay are the fees you pay.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">Bank data</h2>
            <p>
              If you link a bank (through Plaid) or upload a bank file, you allow Domus to read those transactions to sort your
              rental money. You can delete them at any time.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">AI helper</h2>
            <p>
              Some features use an AI helper (Anthropic&apos;s Claude) to answer questions about your data. Its answers can be
              wrong. Check anything important before you act on it.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">Rules</h2>
            <p>Don&apos;t use Domus to break the law, harm others, send spam or harmful code, or get into data that isn&apos;t yours.</p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">Ending your account</h2>
            <p>You can ask to delete your account at any time in Settings. We can pause or close accounts that break these terms.</p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">No guarantees</h2>
            <p>
              Domus is provided &quot;as is&quot;. We work to keep it running and correct, but we can&apos;t promise it will
              always be available or error-free.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">Changes</h2>
            <p>If we change these terms in a way that matters, we will tell you in the app or by email before the change takes effect.</p>
          </article>
        </section>
      </main>
    </LandingShell>
  );
}
