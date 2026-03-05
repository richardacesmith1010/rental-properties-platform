import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LandingShell } from "@/components/marketing/landing-shell";
import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: "Domus — Rental Property Management",
  description:
    "Run your rental portfolio with confidence using Domus for payments, maintenance, documents, and role-based operations.",
};

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/portal");
  }

  return (
    <LandingShell>
      <LandingPage />
    </LandingShell>
  );
}
