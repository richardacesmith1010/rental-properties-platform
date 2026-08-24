import Link from "next/link";
import { ArrowRight, BarChart3, ShieldCheck, Sparkles } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { RoleSelector } from "@/components/auth/role-selector";
import { Alert } from "@/components/ui/alert";
import { getCurrentUserRole, getRoleHomePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

interface LoginPageProps {
  searchParams?: {
    error?: string;
    error_description?: string;
    confirmed?: string;
    password_reset?: string;
  };
}

export const metadata: Metadata = {
  title: "Login",
  description: "Sign in to Domus as Owner, Manager, or Tenant to access your rental workspace.",
};

const proofPoints = [
  { label: "Landlords", value: "500+" },
  { label: "Units managed", value: "2,000+" },
  { label: "With Stripe + Resend", value: "Live" }
];

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = createClient();
  const cookieStore = cookies();
  const { data } = await supabase.auth.getUser();
  const currentYear = new Date().getFullYear();
  const callbackError = searchParams?.error;
  const callbackErrorDescription = searchParams?.error_description;
  const emailConfirmed = searchParams?.confirmed === "true";
  const passwordReset = searchParams?.password_reset === "true";
  const sessionExpired = cookieStore.get("x-session-expired")?.value === "1";

  if (data.user) {
    const role = await getCurrentUserRole(data.user.id);
    redirect(getRoleHomePath(role));
  }

  return (
    <div className="app-surface min-h-screen">
      <div className="flex min-h-screen flex-col lg:grid lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative overflow-hidden border-b border-[var(--line)] bg-[var(--ground)] px-5 py-8 text-[var(--ink)] sm:px-8 lg:flex lg:flex-col lg:justify-between lg:border-b-0 lg:border-r lg:px-12 lg:py-12">
          <div className="relative z-10 flex items-center justify-between">
            <Link href="/marketing" className="inline-flex items-center" title="Return to the Domus marketing page.">
              <div>
                <p className="text-xl font-bold tracking-tight text-[var(--ink)]">Domus</p>
                <p className="text-xs text-[var(--muted)]">Rental Property Management</p>
              </div>
            </Link>
            <Link
              href="/marketing"
              className="hidden items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] transition hover:border-[var(--accent-line)] hover:bg-[var(--accent-weak)] hover:text-[var(--accent)] lg:inline-flex"
              title="Explore Domus features and pricing."
            >
              Product Tour
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="relative z-10 mt-8 grid gap-6 lg:mt-16 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-10">
            <div className="max-w-2xl space-y-5">
              <p className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-line)] bg-[var(--accent-weak)] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
                <Sparkles className="h-3.5 w-3.5" />
                Premium landlord workspace
              </p>
              <div className="space-y-4">
                <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
                  Manage your rentals like a pro.
                </h1>
                <p className="max-w-xl text-base leading-7 text-[var(--ink-2)] sm:text-lg">
                  Domus brings rent collection, maintenance, documents, and tenant communication into one polished command center for owners, managers, and tenants.
                </p>
              </div>

              <div className="hidden gap-3 sm:grid sm:grid-cols-3">
                {proofPoints.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4 shadow-[var(--domus-shadow-sm)]"
                  >
                    <p className="tabular-nums text-2xl font-semibold text-[var(--ink)]">{item.value}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{item.label}</p>
                  </div>
                ))}
              </div>

              <div className="hidden gap-3 text-sm text-[var(--ink-2)] sm:grid sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4">
                  <div className="flex items-center gap-2 font-semibold text-[var(--ink)]">
                    <BarChart3 className="h-4 w-4" />
                    See what matters first
                  </div>
                  <p className="mt-2 leading-6 text-[var(--muted)]">
                    Revenue, occupancy, open tickets, and overdue balances stay visible without a spreadsheet.
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4">
                  <div className="flex items-center gap-2 font-semibold text-[var(--ink)]">
                    <ShieldCheck className="h-4 w-4" />
                    Built for real operations
                  </div>
                  <p className="mt-2 leading-6 text-[var(--muted)]">
                    Role-aware access, branded emails, invoices, and real payment workflows are already wired in.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </section>

        <section className="flex flex-1 items-center justify-center bg-background/95 px-4 py-8 sm:px-6 lg:px-10">
          <div className="w-full max-w-xl">
            <div className="domus-card overflow-hidden border border-border/60 shadow-[0_30px_90px_-45px_rgba(15,23,42,0.35)]">
              <div className="border-b border-border/60 bg-background/90 px-6 py-6 sm:px-8">
                <div className="mb-5 lg:hidden">
                  <div>
                    <p className="text-lg font-semibold text-foreground">Domus</p>
                    <p className="text-xs text-muted-foreground">Rental Property Management</p>
                  </div>
                </div>

                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Welcome back</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                  Sign in to your workspace
                </h2>
                <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                  Choose your role, then sign in or create your account. Domus keeps owners, managers, and tenants in the same system with the right access for each.
                </p>
              </div>

              <div className="space-y-4 px-6 py-6 sm:px-8">
                {sessionExpired ? (
                  <Alert variant="warning" className="px-4 py-3">
                    <p className="font-medium">Your session expired.</p>
                    <p className="mt-1">Please sign in again.</p>
                  </Alert>
                ) : null}

                {emailConfirmed ? (
                  <Alert variant="success" className="px-4 py-3">
                    <p className="font-medium">Email confirmed!</p>
                    <p className="mt-1">Your account is ready. Sign in below with your email and password.</p>
                  </Alert>
                ) : null}

                {passwordReset ? (
                  <Alert variant="success" className="px-4 py-3">
                    <p className="font-medium">Password updated!</p>
                    <p className="mt-1">Sign in below with your new password.</p>
                  </Alert>
                ) : null}

                {callbackError === "invite_expired" ? (
                  <Alert variant="warning" className="px-4 py-3">
                    <p className="font-semibold">Invitation link expired</p>
                    <p className="mt-1">
                      This invite link is no longer valid. Please ask your landlord or property manager to resend the invitation.
                    </p>
                  </Alert>
                ) : null}

                {callbackError && callbackError !== "invite_expired" ? (
                  <Alert variant="error" className="px-4 py-3">
                    <p className="font-medium">Sign-in link failed.</p>
                    <p className="mt-1">
                      {callbackErrorDescription ?? "Please request a new sign-in link and try again."}
                    </p>
                  </Alert>
                ) : null}

                <RoleSelector />
              </div>

              <div className="border-t border-border/60 bg-muted/30 px-6 py-4 text-center sm:px-8">
                <p className="text-sm text-muted-foreground">
                  New to Domus?{" "}
                  <Link href="/marketing" className="font-semibold text-primary hover:text-primary/80" title="Explore Domus plans and features.">
                    See plans and get started
                  </Link>
                </p>
              </div>
            </div>

            <footer className="mt-6 text-center text-xs text-muted-foreground">
              &copy; {currentYear} Domus. All rights reserved.
            </footer>
          </div>
        </section>
      </div>
    </div>
  );
}
