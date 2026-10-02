import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, getRoleHomePath } from "@/lib/auth";
import { LandingShell } from "@/components/marketing/landing-shell";
import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: "Domus — Rental Property Management",
  description: "Manage rent, repairs, leases, reports, and property records in one place.",
};

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    const role = await getCurrentUserRole(user.id);
    redirect(getRoleHomePath(role));
  }

  return (
    <LandingShell>
      <LandingPage />
    </LandingShell>
  );
}
