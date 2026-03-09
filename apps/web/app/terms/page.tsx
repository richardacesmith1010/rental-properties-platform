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
          <h1 className="text-3xl font-semibold tracking-tight text-white">Terms of Service</h1>
          <p className="text-sm text-slate-300">Last updated: March 4, 2026</p>
          <p className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            This document was last updated on March 4, 2026. Please review periodically for changes.
          </p>
        </header>

        <section className="space-y-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm leading-7 text-slate-300">
          <article className="space-y-2">
            <h2 className="text-base font-semibold text-white">Service Description</h2>
            <p>
              Domus provides software tools for rental property operations, including payment tracking,
              maintenance workflows, documents, and role-based access controls.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-white">Account Terms</h2>
            <p>
              You are responsible for maintaining accurate account information and safeguarding account
              credentials. You must have authority to act for the properties and users you manage in Domus.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-white">Payment Terms</h2>
            <p>
              Paid plans are billed according to the selected tier and billing cycle. Fees are non-refundable
              except where required by law or explicitly stated in a written agreement.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-white">Acceptable Use</h2>
            <p>
              You may not use Domus to violate applicable laws, transmit malicious content, interfere with the
              platform, or access data without authorization.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-white">Termination</h2>
            <p>
              We may suspend or terminate accounts for violations of these terms, non-payment, or misuse of the
              service. You may cancel your account at any time subject to plan terms.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-white">Limitation of Liability</h2>
            <p>
              Domus is provided on an &quot;as is&quot; basis. To the maximum extent permitted by law, Domus is not
              liable for indirect, incidental, or consequential damages arising from use of the platform.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-white">Contact Information</h2>
            <p>
              Questions about these terms can be sent to
              {" "}<a className="text-violet-200 underline-offset-4 hover:underline" href="mailto:support@domusbase.com">support@domusbase.com</a>.
            </p>
          </article>
        </section>
      </main>
    </LandingShell>
  );
}
