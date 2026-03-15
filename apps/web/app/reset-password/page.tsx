import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set a new password for your Domus account."
};

export default async function ResetPasswordPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login");
  }

  return (
    <div className="app-surface flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Reset Your Password
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Enter a new password for your Domus account.
          </p>
        </div>
        <ResetPasswordForm />
      </div>
    </div>
  );
}
