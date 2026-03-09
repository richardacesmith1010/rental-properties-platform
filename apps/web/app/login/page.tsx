import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { RoleSelector } from "@/components/auth/role-selector";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { getCurrentUserRole, getRoleHomePath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

interface LoginPageProps {
  searchParams?: {
    error?: string;
    error_description?: string;
    confirmed?: string;
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
        <div className="mb-6 w-full max-w-3xl rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <p className="font-medium">Email confirmed!</p>
          <p className="mt-1">Your account is ready. Sign in below with your email and password.</p>
        </div>
      )}

      {callbackError && (
        <div className="mb-6 w-full max-w-3xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-medium">Sign-in link failed.</p>
          <p className="mt-1">
            {callbackErrorDescription ?? "Please request a new sign-in link and try again."}
          </p>
        </div>
      )}

      <RoleSelector />
    </div>
  );
}
