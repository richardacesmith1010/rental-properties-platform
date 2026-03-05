import type { Metadata } from "next";
import { LandingShell } from "@/components/marketing/landing-shell";
import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: "Marketing",
  description:
    "Explore Domus pricing, features, and role-based rental operations for owners, managers, and tenants.",
};

export default function MarketingPage() {
  return (
    <LandingShell>
      <LandingPage />
    </LandingShell>
  );
}
