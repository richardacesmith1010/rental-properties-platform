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

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const callbackError = searchParams?.error;
  const callbackErrorDescription = searchParams?.error_description;
  const emailConfirmed = searchParams?.confirmed === "true";
  const passwordReset = searchParams?.password_reset === "true";

  if (data.user) {
    const role = await getCurrentUserRole(data.user.id);
    redirect(getRoleHomePath(role));
  }

  return (
    <div className="app-surface flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-4 flex w-fit items-center justify-center rounded-3xl bg-white/80 px-4 py-3 shadow-lg shadow-violet-500/10">
          <DomMascot size="lg" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          Welcome to Domus
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Sign in, level up, and keep your rental world moving.
        </p>
      </div>

      {emailConfirmed && (
        <Alert variant="success" className="mb-6 w-full max-w-3xl px-4 py-3">
          <p className="font-medium">Email confirmed!</p>
          <p className="mt-1">Your account is ready. Sign in below with your email and password.</p>
        </Alert>
      )}

      {passwordReset && (
        <Alert variant="success" className="mb-6 w-full max-w-3xl px-4 py-3">
          <p className="font-medium">Password updated!</p>
          <p className="mt-1">Sign in below with your new password.</p>
        </Alert>
      )}

      {callbackError === "invite_expired" && (
        <Alert variant="warning" className="mb-6 w-full max-w-sm px-4 py-3">
          <p className="font-semibold">Invitation link expired</p>
          <p className="mt-1">
            This invite link is no longer valid. Please ask your landlord or property manager to resend the invitation.
          </p>
        </Alert>
      )}

      {callbackError && callbackError !== "invite_expired" && (
        <Alert variant="error" className="mb-6 w-full max-w-3xl px-4 py-3">
          <p className="font-medium">Sign-in link failed.</p>
          <p className="mt-1">
            {callbackErrorDescription ?? "Please request a new sign-in link and try again."}
          </p>
        </Alert>
      )}

      <RoleSelector />
    </div>
  );
}
