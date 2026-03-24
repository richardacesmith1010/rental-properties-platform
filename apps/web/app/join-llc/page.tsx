import Link from "next/link";
import { ArrowRight, Building2, ShieldCheck, Users } from "lucide-react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  acceptLLCInvitation,
  createAccountToJoinLLC,
  signInToJoinLLC,
  signOut
} from "@/app/actions";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getExistingProfileByEmail,
  getLLCInvitationContextByToken,
  normalizeInvitationEmail
} from "@/lib/llc-invitations";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Join LLC",
  description: "Accept your Domus LLC invitation and join the shared rental workspace."
};

export const dynamic = "force-dynamic";

interface JoinLlcPageProps {
  searchParams?: {
    token?: string;
    mode?: string;
    error?: string;
  };
}

function InviteErrorState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 shadow-xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <h1 className="text-center text-2xl font-semibold text-foreground">{title}</h1>
        <p className="mt-3 text-center text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-6 flex justify-center">
          <Button asChild title="Return to the Domus marketing page.">
            <Link href="/marketing">Back to Domus</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

export default async function JoinLlcPage({ searchParams }: JoinLlcPageProps) {
  const token = typeof searchParams?.token === "string" ? searchParams.token : "";
  if (!token) {
    return (
      <InviteErrorState
        title="Invitation missing"
        description="This LLC invitation link is missing its token. Ask the inviter to resend the email."
      />
    );
  }

  const invitation = await getLLCInvitationContextByToken(token);
  if (!invitation) {
    return (
      <InviteErrorState
        title="Invitation unavailable"
        description="This invitation could not be found. Ask the LLC owner to send you a fresh invite."
      />
    );
  }

  if (invitation.status === "expired") {
    return (
      <InviteErrorState
        title="Invitation expired"
        description="This invitation expired after 7 days. Ask the LLC owner to resend it from the Members page."
      />
    );
  }

  if (invitation.status !== "pending") {
    return (
      <InviteErrorState
        title="Invitation already used"
        description="This invitation is no longer active. Sign in to Domus if you already joined this LLC."
      />
    );
  }

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user?.id && user.email) {
    if (normalizeInvitationEmail(user.email) !== normalizeInvitationEmail(invitation.email)) {
      return (
        <main className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
          <div className="w-full max-w-xl rounded-3xl border border-border bg-card p-8 shadow-xl">
            <Alert variant="warning" className="px-4 py-3">
              You&apos;re signed in as <span className="font-semibold text-foreground">{user.email}</span>, but this invitation was sent to <span className="font-semibold text-foreground">{invitation.email}</span>.
            </Alert>
            <h1 className="mt-6 text-2xl font-semibold text-foreground">Wrong account open</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Sign out, then open the invite again with the email address that was invited to join {invitation.accountName}.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <form action={signOut}>
                <Button type="submit" title="Sign out of the current Domus session.">
                  Sign out
                </Button>
              </form>
              <Button asChild variant="outline" title="Return to the Domus marketing page.">
                <Link href="/marketing">Back to Domus</Link>
              </Button>
            </div>
          </div>
        </main>
      );
    }

    const accepted = await acceptLLCInvitation(token);
    if (accepted?.success && accepted.accountId) {
      redirect(`/owner?account=${encodeURIComponent(accepted.accountId)}`);
    }

    const acceptError =
      accepted && !accepted.success
        ? accepted.error
        : "Please sign in again or ask the LLC owner to resend the invitation.";

    return (
      <InviteErrorState
        title="Invitation could not be accepted"
        description={acceptError}
      />
    );
  }

  const existingProfile = await getExistingProfileByEmail(invitation.email);
  const mode = searchParams?.mode === "signin" || existingProfile ? "signin" : "signup";
  const error = typeof searchParams?.error === "string" ? searchParams.error : null;

  return (
    <div className="app-surface min-h-screen">
      <div className="flex min-h-screen flex-col lg:grid lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(196,181,253,0.45),transparent_30%),linear-gradient(135deg,#5b21b6_0%,#7c3aed_42%,#0f172a_100%)] px-5 py-8 text-white sm:px-8 lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_18%,rgba(255,255,255,0.12),transparent_24%),radial-gradient(circle_at_20%_85%,rgba(52,211,153,0.16),transparent_22%)]" />
          <div className="relative z-10 flex items-center justify-between">
            <Link href="/marketing" className="inline-flex items-center gap-3" title="Return to the Domus marketing page.">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-lg font-bold shadow-lg shadow-slate-950/25 backdrop-blur-sm">
                D
              </div>
              <div>
                <p className="text-lg font-semibold tracking-tight">Domus</p>
                <p className="text-xs uppercase tracking-[0.2em] text-white/70">Rental operations</p>
              </div>
            </Link>
            <div className="hidden rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 lg:inline-flex">
              LLC invitation
            </div>
          </div>

          <div className="relative z-10 mt-8 grid gap-6 lg:mt-16 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-10">
            <div className="max-w-2xl space-y-5">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white/85">
                <Users className="h-3.5 w-3.5" />
                Shared ownership workspace
              </p>
              <div className="space-y-4">
                <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
                  You&apos;ve been invited to join {invitation.accountName}.
                </h1>
                <p className="max-w-xl text-base leading-7 text-white/78 sm:text-lg">
                  {invitation.invitedByName ?? "A Domus owner"} invited you to collaborate on the LLC dashboard for properties, members, distributions, and shared financial operations.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/[0.14] bg-white/10 px-4 py-4 backdrop-blur-sm">
                  <div className="flex items-center gap-2 font-semibold">
                    <Building2 className="h-4 w-4" />
                    LLC account
                  </div>
                  <p className="mt-2 text-sm text-white/72">{invitation.accountName}</p>
                </div>
                <div className="rounded-2xl border border-white/[0.14] bg-white/10 px-4 py-4 backdrop-blur-sm">
                  <div className="flex items-center gap-2 font-semibold">
                    <ShieldCheck className="h-4 w-4" />
                    Invited email
                  </div>
                  <p className="mt-2 text-sm text-white/72">{invitation.email}</p>
                </div>
              </div>
            </div>

            <div className="mx-auto hidden lg:mx-0 lg:block">
              <div className="rounded-[32px] border border-white/[0.14] bg-white/10 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur-md">
                <DomMascot size="xl" mood="waving" className="mx-auto" />
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-1 items-center justify-center bg-background/95 px-4 py-8 sm:px-6 lg:px-10">
          <div className="w-full max-w-xl">
            <div className="domus-card overflow-hidden border border-border/60 shadow-[0_30px_90px_-45px_rgba(15,23,42,0.35)]">
              <div className="border-b border-border/60 bg-background/90 px-6 py-6 sm:px-8">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">{mode === "signin" ? "Sign in" : "Create account"}</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                  {mode === "signin"
                    ? `Sign in to join ${invitation.accountName}`
                    : `Create your account to join ${invitation.accountName}`}
                </h2>
                <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                  {mode === "signin"
                    ? "Use the invited email address below. Once you sign in, Domus will attach you to this LLC automatically."
                    : "Create your Domus owner account and you’ll land directly in this LLC workspace."}
                </p>
              </div>

              <div className="space-y-4 px-6 py-6 sm:px-8">
                {error ? (
                  <Alert variant="error" className="px-4 py-3">
                    {error}
                  </Alert>
                ) : null}

                {mode === "signin" ? (
                  <form action={signInToJoinLLC} className="space-y-4">
                    <input type="hidden" name="token" value={token} />
                    <div>
                      <label htmlFor="join-llc-email" className="mb-1.5 block text-sm font-medium text-foreground">
                        Email
                      </label>
                      <Input id="join-llc-email" name="email" value={invitation.email} readOnly title="This invitation is tied to this email address." />
                    </div>
                    <div>
                      <label htmlFor="join-llc-password" className="mb-1.5 block text-sm font-medium text-foreground">
                        Password
                      </label>
                      <Input id="join-llc-password" name="password" type="password" placeholder="Enter your password" required title="Enter your Domus password to join this LLC." />
                    </div>
                    <Button type="submit" className="w-full" title={`Sign in and join ${invitation.accountName}.`}>
                      Join {invitation.accountName}
                    </Button>
                  </form>
                ) : (
                  <form action={createAccountToJoinLLC} className="space-y-4">
                    <input type="hidden" name="token" value={token} />
                    <div>
                      <label htmlFor="join-llc-signup-email" className="mb-1.5 block text-sm font-medium text-foreground">
                        Email
                      </label>
                      <Input id="join-llc-signup-email" value={invitation.email} readOnly title="This new account will be created for the invited email address." />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="join-llc-first-name" className="mb-1.5 block text-sm font-medium text-foreground">
                          First name
                        </label>
                        <Input id="join-llc-first-name" name="firstName" placeholder="First name" required title="Enter the first name for this Domus owner profile." />
                      </div>
                      <div>
                        <label htmlFor="join-llc-last-name" className="mb-1.5 block text-sm font-medium text-foreground">
                          Last name
                        </label>
                        <Input id="join-llc-last-name" name="lastName" placeholder="Last name" required title="Enter the last name for this Domus owner profile." />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="join-llc-create-password" className="mb-1.5 block text-sm font-medium text-foreground">
                        Password
                      </label>
                      <Input id="join-llc-create-password" name="password" type="password" minLength={6} placeholder="Create a password" required title="Create a password for your new Domus account." />
                    </div>
                    <div>
                      <label htmlFor="join-llc-confirm-password" className="mb-1.5 block text-sm font-medium text-foreground">
                        Confirm password
                      </label>
                      <Input id="join-llc-confirm-password" name="confirmPassword" type="password" minLength={6} placeholder="Confirm your password" required title="Confirm your new Domus password." />
                    </div>
                    <Button type="submit" className="w-full" title={`Create your account and join ${invitation.accountName}.`}>
                      Create Account & Join {invitation.accountName}
                    </Button>
                  </form>
                )}
              </div>

              <div className="border-t border-border/60 bg-muted/30 px-6 py-4 text-center text-sm text-muted-foreground sm:px-8">
                <p>
                  Need a different link? Ask {invitation.invitedByName ?? "the LLC owner"} to resend the invitation from the Members page.
                </p>
                <Link href="/marketing" className="mt-3 inline-flex items-center gap-2 font-semibold text-primary hover:text-primary/80" title="Explore Domus before you join.">
                  Explore Domus
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
