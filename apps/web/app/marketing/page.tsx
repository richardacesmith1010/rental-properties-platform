import type { Metadata } from "next";
import { LandingShell } from "@/components/marketing/landing-shell";
import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: "Domus",
  description:
    "Explore Domus plans and tools for owners, managers, and tenants.",
};

export default function MarketingPage() {
  return (
    <LandingShell>
      <LandingPage />
    </LandingShell>
  );
}
