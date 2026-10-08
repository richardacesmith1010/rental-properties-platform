import type { Metadata } from "next";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isJoinInviteActive, INACTIVE_INVITE_MESSAGE } from "@/lib/join-invite";
import { maskEmail } from "@/lib/mask-email";
import { JoinInviteForm } from "./join-invite-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function JoinPage({ params }: { params: Promise<{ inviteId: string }> }) {
  noStore();
  const { inviteId } = await params;
  const validId = z.string().uuid().safeParse(inviteId);
  let state: "active" | "accepted" | "inactive" = "inactive";
  let maskedEmail = "";
  let inviterFirstName = "";
  let homeName: string | null = null;

  if (validId.success) {
    const admin = createAdminClient();
    const { data: invite, error } = await admin.from("invitations")
      .select("id, email, role, status, created_at, property_id, invited_by")
      .eq("id", inviteId).maybeSingle();
    if (!error && invite?.role !== "owner" && invite?.status === "accepted" &&
      ["tenant", "manager"].includes(invite.role)) {
      state = "accepted";
    } else if (!error && invite && isJoinInviteActive(invite)) {
      state = "active";
      maskedEmail = maskEmail(invite.email);
      const [{ data: property, error: propertyError }, { data: inviter, error: inviterError }] = await Promise.all([
        invite.property_id
          ? admin.from("properties").select("name").eq("id", invite.property_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        admin.from("profiles").select("full_name").eq("id", invite.invited_by).maybeSingle()
      ]);
      if (propertyError) console.error("Join property lookup failed:", propertyError);
      if (inviterError) console.error("Join inviter lookup failed:", inviterError);
      homeName = property?.name ?? null;
      inviterFirstName = inviter?.full_name?.trim().split(/\s+/)[0] ?? "Someone";
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--ground)] px-4 py-10 text-[var(--ink)]">
      <div className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--domus-shadow-sm)]">
        {state === "active" ? (
          <>
            <h1 className="text-2xl font-semibold">You&apos;re invited to Domus</h1>
            <p className="mt-4 text-[var(--ink-2)]">
              {inviterFirstName} invited you{homeName ? ` to ${homeName}` : ""}.
            </p>
            <p className="mt-3 text-[var(--ink-2)]">We emailed a sign-in link to {maskedEmail}.</p>
            <JoinInviteForm />
            <p className="mt-4 text-sm text-[var(--muted)]">
              Check your spam or junk folder. The email comes from Domus.
            </p>
          </>
        ) : state === "accepted" ? (
          <>
            <h1 className="text-2xl font-semibold">This invite was already used.</h1>
            <Link href="/login" className="mt-4 inline-block text-[var(--accent)] underline" title="Sign in to Domus.">
              Sign in
            </Link>
          </>
        ) : <p>{INACTIVE_INVITE_MESSAGE}</p>}
      </div>
    </main>
  );
}
