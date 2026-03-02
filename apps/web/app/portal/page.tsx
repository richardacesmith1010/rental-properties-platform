import Link from "next/link";
import { ArrowRight, Home, Settings, FlaskConical, ShieldCheck } from "lucide-react";
import { getAuthenticatedUser, getCurrentUserRole, getRoleHomePath, isTester } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const user = await getAuthenticatedUser();
  const [role, testerAccess] = await Promise.all([
    getCurrentUserRole(user.id),
    isTester(user.id)
  ]);
  const workspacePath = getRoleHomePath(role);
  const workspaceLabel =
    role === "owner"
      ? "Owner Workspace"
      : role === "manager"
        ? "Manager Workspace"
        : "Tenant Workspace";

  return (
    <main className="app-surface min-h-screen px-6 py-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Portal Home</h1>
          <p className="text-sm text-zinc-600">
            You are signed in as <span className="font-semibold text-zinc-900">{user.email ?? "unknown"}</span>.
            Use this page to jump anywhere without signing in again.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={workspacePath}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              title={`Open ${workspaceLabel}.`}
            >
              Workspace
            </Link>
            <Link
              href="/settings"
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              title="Open settings page."
            >
              Settings
            </Link>
            <Link
              href="/marketing"
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              title="Open public marketing page while staying signed in."
            >
              Marketing
            </Link>
            {testerAccess && (
              <Link
                href="/tester"
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                title="Open tester diagnostics mode."
              >
                Tester
              </Link>
            )}
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Primary</h2>
            </div>
            <p className="mt-3 text-base font-semibold text-zinc-900">{workspaceLabel}</p>
            <p className="mt-1 text-sm text-zinc-600">
              Open your main role workspace and continue operations.
            </p>
            <Link
              href={workspacePath}
              className="mt-4 inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              title={`Open ${workspaceLabel}.`}
            >
              Open Workspace
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </article>

          <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Preferences</h2>
            </div>
            <p className="mt-3 text-base font-semibold text-zinc-900">Settings</p>
            <p className="mt-1 text-sm text-zinc-600">
              Adjust theme and interface options.
            </p>
            <Link
              href="/settings"
              className="mt-4 inline-flex items-center rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              title="Open settings page."
            >
              Open Settings
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </article>

          <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Public Site</h2>
            </div>
            <p className="mt-3 text-base font-semibold text-zinc-900">Marketing Page</p>
            <p className="mt-1 text-sm text-zinc-600">
              View the public-facing Domus page without signing out.
            </p>
            <Link
              href="/marketing"
              className="mt-4 inline-flex items-center rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              title="Open marketing page while staying signed in."
            >
              Open Marketing Page
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </article>

          {(role === "owner" || role === "manager") && (
            <>
              <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Home className="h-4 w-4 text-indigo-600" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Leasing</h2>
                </div>
                <p className="mt-3 text-base font-semibold text-zinc-900">Leasing Hub</p>
                <p className="mt-1 text-sm text-zinc-600">
                  Track leasing progress from invitation to signed docs and billing live.
                </p>
                <Link
                  href={`${workspacePath}?mode=new_tenant&section=leasing`}
                  className="mt-4 inline-flex items-center rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                  title="Open Leasing Hub in your workspace."
                >
                  Open Leasing Hub
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </article>

              <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Home className="h-4 w-4 text-indigo-600" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Operations</h2>
                </div>
                <p className="mt-3 text-base font-semibold text-zinc-900">Inbox + Flows</p>
                <p className="mt-1 text-sm text-zinc-600">
                  Open Domus Inbox and Domus Flows to monitor events and automation templates.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`${workspacePath}?mode=daily_ops&section=inbox`}
                    className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                    title="Open Domus Inbox."
                  >
                    Open Inbox
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                  <Link
                    href={`${workspacePath}?mode=daily_ops&section=automations`}
                    className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                    title="Open Domus Flows."
                  >
                    Open Flows
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </div>
              </article>
            </>
          )}
        </section>

        {testerAccess && (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Diagnostics</h2>
            </div>
            <p className="mt-3 text-base font-semibold text-zinc-900">Tester Mode</p>
            <p className="mt-1 text-sm text-zinc-600">
              Run feature tests, preview each role, and copy failure reports when anything breaks.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/tester"
                className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                title="Open tester diagnostics mode."
              >
                Open Tester Mode
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
              <Link
                href={`${workspacePath}?testerPreview=true`}
                className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                title="Open your workspace while keeping tester preview enabled."
              >
                Open Workspace Preview
                <ShieldCheck className="ml-1 h-3.5 w-3.5" />
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
