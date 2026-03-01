import { redirect } from "next/navigation";
import { RoleSelector } from "@/components/auth/role-selector";
import { createClient } from "@/lib/supabase/server";

interface LoginPageProps {
  searchParams?: {
    error?: string;
    error_description?: string;
  };
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const callbackError = searchParams?.error;
  const callbackErrorDescription = searchParams?.error_description;

  if (data.user) {
    redirect("/portal");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#fafafa] px-4 py-12">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-xl font-bold text-white shadow-lg shadow-indigo-500/25">
          R
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          Welcome to Domus
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Choose your role to get started.
        </p>
      </div>

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
