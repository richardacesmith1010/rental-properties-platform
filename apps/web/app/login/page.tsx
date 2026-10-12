import Link from "next/link";
import { ArrowRight, BarChart3, House, ShieldCheck, Sparkles } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { SignInForm } from "@/components/auth/sign-in-form";
import { CreateAccountForm } from "@/components/auth/create-account-form";
import { Alert } from "@/components/ui/alert";
import { getCurrentUserRole, getRoleHomePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

interface LoginPageProps {
  searchParams?: Promise<{
    error?: string;
    error_description?: string;
    confirmed?: string;
    password_reset?: string;
    mode?: string;
    role?: string;
  }>;
}

export const metadata: Metadata = {
  title: "Login",
  description: "Sign in to Domus to manage your rentals.",
};

export default async function LoginPage(props: LoginPageProps) {
  const searchParams = await props.searchParams;
  const supabase = createClient();
  const cookieStore = await cookies();
  const { data } = await supabase.auth.getUser();
  const currentYear = new Date().getFullYear();
  const callbackError = searchParams?.error;
  const emailConfirmed = searchParams?.confirmed === "true";
  const passwordReset = searchParams?.password_reset === "true";
  const isSignup = searchParams?.mode === "signup";
  const sessionExpired = cookieStore.get("x-session-expired")?.value === "1";

  if (data.user) {
    const role = await getCurrentUserRole(data.user.id);
    redirect(getRoleHomePath(role));
  }

  return (
    <div className="domus-login-page app-surface min-h-screen">
      <div className="flex min-h-screen flex-col lg:grid lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden border-b border-[var(--line)] bg-[var(--ground)]
          px-5 py-8 text-[var(--ink)] sm:px-8 lg:flex lg:flex-col lg:justify-between lg:border-b-0
          lg:border-r lg:px-12 lg:py-12">
          <div className="relative z-10 flex items-center justify-between">
            <Link href="/marketing" className="inline-flex items-center" title="Return to the Domus marketing page.">
              <div>
                <p className="text-xl font-bold tracking-tight text-[var(--ink)]">Domus</p>
                <p className="text-xs text-[var(--muted)]">Rental Property Management</p>
              </div>
            </Link>
            <Link
              href="/marketing"
              className="hidden items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)]
                px-4 py-2 text-sm font-medium text-[var(--ink-2)] transition hover:border-[var(--accent-line)]
                hover:bg-[var(--accent-weak)] hover:text-[var(--accent)] lg:inline-flex"
              title="Explore Domus features and pricing."
            >
              Product Tour
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="relative z-10 mt-8 grid gap-6 lg:mt-16 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-10">
            <div className="max-w-2xl space-y-5">
              <p className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-line)]
                bg-[var(--accent-weak)] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em]
                text-[var(--accent)]">
                <Sparkles className="h-3.5 w-3.5" />
                Your rental workspace
              </p>
              <div className="space-y-4">
                <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
                  Manage your rentals like a pro.
                </h1>
                <p className="max-w-xl text-base leading-7 text-[var(--ink-2)] sm:text-lg">
                  Domus brings rent, repairs, documents, and messages into one place. Owners, managers, and tenants can all use it.
                </p>
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
                    Each person sees the right tools, emails, bills, and payments.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </section>

        <section className="flex flex-1 items-center justify-center bg-[var(--ground)] px-5 py-10 sm:px-6 lg:px-10">
          <div className="w-full max-w-[420px]">
            {!isSignup ? <>
              <div aria-hidden="true" className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl
                bg-[var(--accent)] text-[var(--accent-contrast)]">
                <House className="h-7 w-7" />
              </div>
              <h1 className="text-[34px] font-bold leading-tight text-[var(--ink)]">Welcome back</h1>
              <p className="mt-2 text-[17px] text-[var(--muted)]">Sign in to see your rent, bills and homes.</p>
              <div className="mt-8 space-y-4">
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

                {callbackError === "reset_link_expired" ? (
                  <Alert variant="error" className="px-4 py-3">
                    <p className="font-medium">This reset link has expired</p>
                    <p className="mt-1">Ask for a new reset link.</p>
                  </Alert>
                ) : null}

                {callbackError && callbackError !== "invite_expired" && callbackError !== "reset_link_expired" ? (
                  <Alert variant="error" className="px-4 py-3">
                    <p className="font-medium">Sign-in link failed.</p>
                    <p className="mt-1">We couldn&apos;t sign you in. Try again.</p>
                  </Alert>
                ) : null}

                <SignInForm />
              </div>
            </> : <CreateAccountForm initialRole={searchParams?.role} />}

            <footer className="mt-6 text-center text-xs text-muted-foreground">
              &copy; {currentYear} Domus. All rights reserved.
            </footer>
          </div>
        </section>
      </div>
    </div>
  );
}
