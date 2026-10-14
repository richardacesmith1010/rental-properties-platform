import Link from "next/link";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function BankAppOAuthPage() {
  await requireRole(["owner"]);
  return <main className="app-surface min-h-screen p-5 text-[var(--ink)]">
    <div className="domus-card mx-auto max-w-3xl space-y-5 p-5">
      <h1 className="text-xl font-semibold">Open the Domus app to finish.</h1>
      <Link href="/owner/bank"
        className="inline-flex min-h-11 items-center rounded-md bg-[var(--accent)] px-4 text-[var(--accent-contrast)]">
        Back to your banks
      </Link>
    </div>
  </main>;
}
