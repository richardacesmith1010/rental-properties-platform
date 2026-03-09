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
          <h1 className="text-3xl font-semibold tracking-tight text-white">Privacy Policy</h1>
          <p className="text-sm text-slate-300">Last updated: March 4, 2026</p>
          <p className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            This document was last updated on March 4, 2026. Please review periodically for changes.
          </p>
        </header>

        <section className="space-y-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm leading-7 text-slate-300">
          <article className="space-y-2">
            <h2 className="text-base font-semibold text-white">Information We Collect</h2>
            <p>
              We collect account details, property and lease records, operational activity, and billing metadata
              needed to provide Domus services.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-white">How We Use Information</h2>
            <p>
              We use data to authenticate users, operate rental workflows, process payments, support maintenance
              operations, and improve platform reliability and security.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-white">Data Sharing</h2>
            <p>
              We share data only with service providers needed to run the platform, such as hosting, payment,
              and communications providers, and only as required to deliver core product functionality.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-white">Data Security</h2>
            <p>
              Domus uses technical and organizational safeguards designed to protect account and operational data,
              including role-based access controls and encrypted transport.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-white">User Rights</h2>
            <p>
              Depending on your jurisdiction, you may have rights to access, correct, export, or delete certain
              personal data. Contact us to submit a request.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-white">Cookie Policy</h2>
            <p>
              Domus uses cookies and similar technologies for session management, security, and essential product
              functionality. Additional analytics preferences may be offered in the future.
            </p>
          </article>

          <article className="space-y-2">
            <h2 className="text-base font-semibold text-white">Contact Information</h2>
            <p>
              Questions about this policy can be sent to
              {" "}<a className="text-violet-200 underline-offset-4 hover:underline" href="mailto:privacy@domusbase.com">privacy@domusbase.com</a>.
            </p>
          </article>
        </section>
      </main>
    </LandingShell>
  );
}
