import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, ShieldCheck, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { RoleSelector } from "@/components/auth/role-selector";
import { DomMascot } from "@/components/gamification/dom-mascot";
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
  const { data } = await supabase.auth.getUser();
  const currentYear = new Date().getFullYear();
  const callbackError = searchParams?.error;
  const callbackErrorDescription = searchParams?.error_description;
  const emailConfirmed = searchParams?.confirmed === "true";
  const passwordReset = searchParams?.password_reset === "true";

  if (data.user) {
    const role = await getCurrentUserRole(data.user.id);
    redirect(getRoleHomePath(role));
  }

  return (
    <div className="app-surface min-h-screen">
      <div className="flex min-h-screen flex-col lg:grid lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(196,181,253,0.45),transparent_30%),linear-gradient(135deg,#5b21b6_0%,#7c3aed_42%,#0f172a_100%)] px-5 py-8 text-white sm:px-8 lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_18%,rgba(255,255,255,0.12),transparent_24%),radial-gradient(circle_at_20%_85%,rgba(52,211,153,0.16),transparent_22%)]" />
          <div className="relative z-10 flex items-center justify-between">
            <Link href="/marketing" className="inline-flex items-center gap-3" title="Return to the Domus marketing page.">
              <Image
                src="/images/mascot/icons/head.png"
                alt="Domus"
                width={44}
                height={44}
                className="rounded-2xl shadow-lg shadow-slate-950/25"
                priority
              />
              <div>
                <p className="text-lg font-semibold tracking-tight">Domus</p>
                <p className="text-xs uppercase tracking-[0.2em] text-white/70">Rental operations</p>
              </div>
            </Link>
            <Link
              href="/marketing"
              className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/15 lg:inline-flex"
              title="Explore Domus features and pricing."
            >
              Product Tour
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="relative z-10 mt-8 grid gap-6 lg:mt-16 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-10">
            <div className="max-w-2xl space-y-5">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white/85">
                <Sparkles className="h-3.5 w-3.5" />
                Premium landlord workspace
              </p>
              <div className="space-y-4">
                <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
                  Manage your rentals like a pro.
                </h1>
                <p className="max-w-xl text-base leading-7 text-white/78 sm:text-lg">
                  Domus brings rent collection, maintenance, documents, and tenant communication into one polished command center for owners, managers, and tenants.
                </p>
              </div>

              <div className="hidden gap-3 sm:grid sm:grid-cols-3">
                {proofPoints.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-white/[0.14] bg-white/10 px-4 py-4 shadow-lg shadow-slate-950/10 backdrop-blur-sm"
                  >
                    <p className="text-2xl font-semibold">{item.value}</p>
                    <p className="mt-1 text-sm text-white/72">{item.label}</p>
                  </div>
                ))}
              </div>

              <div className="hidden gap-3 text-sm text-white/82 sm:grid sm:grid-cols-2">
                <div className="rounded-2xl border border-white/[0.14] bg-white/10 px-4 py-4 backdrop-blur-sm">
                  <div className="flex items-center gap-2 font-semibold">
                    <BarChart3 className="h-4 w-4" />
                    See what matters first
                  </div>
                  <p className="mt-2 leading-6 text-white/72">
                    Revenue, occupancy, open tickets, and overdue balances stay visible without a spreadsheet.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/[0.14] bg-white/10 px-4 py-4 backdrop-blur-sm">
                  <div className="flex items-center gap-2 font-semibold">
                    <ShieldCheck className="h-4 w-4" />
                    Built for real operations
                  </div>
                  <p className="mt-2 leading-6 text-white/72">
                    Role-aware access, branded emails, invoices, and real payment workflows are already wired in.
                  </p>
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
                <div className="mb-5 flex items-center gap-3 lg:hidden">
                  <Image
                    src="/images/mascot/icons/head.png"
                    alt="Domus"
                    width={40}
                    height={40}
                    className="rounded-2xl"
                    priority
                  />
                  <div>
                    <p className="text-lg font-semibold text-foreground">Domus</p>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Rental operations</p>
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
