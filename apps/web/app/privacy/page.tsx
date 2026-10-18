import type { Metadata } from "next";
import { LandingShell } from "@/components/marketing/landing-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Domus privacy policy describing how user and property data is handled.",
};

export default function PrivacyPage() {
  return (
    <LandingShell>
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 pb-16 pt-10 md:px-10">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">Privacy Policy</h1>
          <p className="text-sm text-[var(--faint)]">Last updated: October 18, 2026</p>
          <p className="rounded-xl border border-[var(--warn)] bg-[var(--warn-bg)] px-4 py-3 text-sm text-[var(--warn)]">
            Early access version. A lawyer is reviewing these terms. We will tell you before a final version takes effect.
          </p>
        </header>

        <section className="space-y-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6
          text-sm leading-7 text-[var(--muted)]">
          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">What we collect</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong className="text-[var(--ink)]">Account details:</strong> name, email, phone (optional), role, profile photo
                (optional).
              </li>
              <li>
                <strong className="text-[var(--ink)]">Rental records:</strong> homes, units, leases, rent amounts, due dates, payments,
                late fees, repairs (with photos), documents, and messages.
              </li>
              <li>
                <strong className="text-[var(--ink)]">Money data:</strong> payment records from Stripe; bank transactions you upload as a
                file or link through Plaid. We do not store full card or bank account numbers.
              </li>
              <li>
                <strong className="text-[var(--ink)]">Use and device data:</strong> sign-in times, pages used, and error reports (to fix
                problems).
              </li>
            </ul>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">How we use it</h2>
            <p>
              To run Domus: sign you in, show the right records to the right people, process payments, sort bank transactions,
              send emails you need (like invites and receipts), keep Domus secure, and fix errors. We do not sell your data. We do
              not use it for ads.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">Who sees it</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong className="text-[var(--ink)]">People in your rental:</strong> an owner and their managers see the records for their
                homes; a tenant sees their own lease, rent, repairs, and messages.
              </li>
              <li>
                <strong className="text-[var(--ink)]">Services we use to run Domus</strong> (each only gets what it needs):
                <ul className="list-disc space-y-1 pl-5">
                  <li>Supabase: database, sign-in, and file storage</li>
                  <li>Vercel: website hosting</li>
                  <li>Stripe: payments and payouts</li>
                  <li>Plaid: bank linking, if you choose it</li>
                  <li>Anthropic: the AI helper, which receives only the data needed to answer your question</li>
                  <li>Resend: email delivery</li>
                  <li>Sentry: error reports, with personal data removed where possible</li>
                  <li>Cloudflare: domain and email routing</li>
                </ul>
              </li>
              <li><strong className="text-[var(--ink)]">The law:</strong> if a valid legal request requires it.</li>
            </ul>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">How long we keep it</h2>
            <p>
              While your account is open. If you ask us to delete your account, we remove your login and personal details within
              30 days. Shared rental records (rent, payments, repairs, messages) stay for the other people in that rental, with
              your name removed, because they need them for their records and taxes. Financial records (rent, payments, expenses)
              are kept for 7 years after the tax year they belong to.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">Your choices and rights</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong className="text-[var(--ink)]">Download your data:</strong> Settings → Your data → Download my data. Owners: email
                privacy@domusbase.com and we send it within 30 days.
              </li>
              <li>
                <strong className="text-[var(--ink)]">Delete your account:</strong> Settings → Your data → Delete my account. Owners:
                Settings → Account &amp; Data → Delete my account.
              </li>
              <li><strong className="text-[var(--ink)]">Fix your details:</strong> Settings → Profile.</li>
              <li><strong className="text-[var(--ink)]">Ask us anything:</strong> privacy@domusbase.com. We answer within 30 days.</li>
              <li>
                Some states (for example California, Colorado, Virginia) give extra rights. We honor those requests through the same
                steps.
              </li>
            </ul>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">Cookies</h2>
            <p>We use cookies only to keep you signed in and keep Domus secure. We don&apos;t use ad cookies.</p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">Security</h2>
            <p>Data is encrypted in transit. Access is limited by role. Payment card data is handled by Stripe, not Domus.</p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">Children</h2>
            <p>Domus is for adults. We don&apos;t knowingly collect data from anyone under 18.</p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">Changes</h2>
            <p>If we change this policy in a way that matters, we will tell you in the app or by email first.</p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">Contact</h2>
            <p>privacy@domusbase.com</p>
          </article>
        </section>
      </main>
    </LandingShell>
  );
}
