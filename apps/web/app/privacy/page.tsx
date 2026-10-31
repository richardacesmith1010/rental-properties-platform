import { LegalBackBar } from "@/components/legal/legal-back-bar";
import { PrivacyDocument } from "@/components/legal/privacy-document";
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
        <LegalBackBar />
        <PrivacyDocument />
      </main>
    </LandingShell>
  );
}
