import { getAuthenticatedUser } from "@/lib/auth";
import { CompleteProfileForm } from "@/components/auth/complete-profile-form";

export const dynamic = "force-dynamic";

export default async function CompleteProfilePage() {
  const user = await getAuthenticatedUser();

  return (
    <main className="app-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-emerald-500 text-xl font-bold text-white shadow-lg shadow-violet-500/25">
            D
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Welcome to Domus!</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Set your password to complete your account setup.
          </p>
        </div>

        <div className="mb-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Email</p>
          <p className="mt-1 text-sm font-medium text-zinc-900">{user.email ?? "unknown"}</p>
        </div>

        <CompleteProfileForm email={user.email ?? ""} />
      </div>
    </main>
  );
}
