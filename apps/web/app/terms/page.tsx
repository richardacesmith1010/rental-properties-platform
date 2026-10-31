import { LegalBackBar } from "@/components/legal/legal-back-bar";
import { TermsDocument } from "@/components/legal/terms-document";
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
        <LegalBackBar />
        <TermsDocument />
      </main>
    </LandingShell>
  );
}
