import Link from "next/link";
import { getAuthenticatedUser, getCurrentUserRole, getRoleHomePath } from "@/lib/auth";
import { ThemeSettingsPanel } from "@/components/settings/theme-settings-panel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getAuthenticatedUser();
  const role = await getCurrentUserRole(user.id);
  const workspacePath = getRoleHomePath(role);

  return (
    <main className="app-surface min-h-screen px-6 py-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Settings</h1>
          <p className="text-sm text-zinc-600">
            Manage your Domus experience and preferences.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={workspacePath}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              title="Return to your main workspace."
            >
              Back to Workspace
            </Link>
            <Link
              href="/portal"
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              title="Go to your role home screen."
            >
              Portal Home
            </Link>
            <Link
              href="/"
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              title="Go to Domus home page while staying logged in."
            >
              App Home
            </Link>
          </div>
        </header>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Appearance
          </h2>
          <div className="mt-3">
            <ThemeSettingsPanel />
          </div>
        </section>
      </div>
    </main>
  );
}
