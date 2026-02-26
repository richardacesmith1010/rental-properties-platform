import { redirect } from "next/navigation";
import { RoleSelector } from "@/components/auth/role-selector";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();

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
          Welcome to RentFlow
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Choose your role to get started.
        </p>
      </div>

      <RoleSelector />
    </div>
  );
}
