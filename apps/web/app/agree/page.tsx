import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser, getCurrentUserRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { agreeDestination, legalStatus, readOwnLegalAcceptances } from "@/lib/legal-acceptance";
import { getSafeNextPath } from "@/lib/route-resolver";
import { agreeToTerms } from "@/app/actions/legal-acceptance";
import { AgreeForm } from "@/components/legal/agree-form";
import { DeclineOptions } from "@/components/legal/decline-options";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terms of Service", robots: { index: false, follow: false } };
export default async function AgreePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getAuthenticatedUser({ legal: "skip" });
  const next = getSafeNextPath((await searchParams).next);
  const [rows, role] = await Promise.all([readOwnLegalAcceptances(createClient()), getCurrentUserRole(user.id)]);
  const status = legalStatus(user.id, rows);
  if (status.accepted) redirect(await agreeDestination(user, next));
  return <main className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
    <div className="domus-card w-full max-w-lg space-y-4 p-6 text-[var(--ink)]">
      <h1 className="text-2xl font-semibold">{status.hasEarlier ? "We updated our Terms" : "Please agree to our Terms"}</h1>
      <p>{status.hasEarlier
        ? "Please read the new Terms and Privacy Policy. Then check the box to keep using Domus."
        : "Please read our Terms and Privacy Policy. Then check the box to keep going."}</p>
      {role === "tenant" ? <p>Our Terms do not change your lease.</p> : null}
      <AgreeForm next={next} action={agreeToTerms} />
      <Link href="/support" className="inline-flex min-h-11 items-center text-[var(--accent)] underline">Need help?</Link>
      <DeclineOptions role={role} />
    </div>
  </main>;
}
