import Link from "next/link";
import { LandingShell } from "@/components/marketing/landing-shell";

export default function NotFound() {
  return (
    <LandingShell>
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-5 px-6 text-center md:px-10">
        <p className="text-7xl font-bold tracking-tight text-[var(--accent)] md:text-8xl">404</p>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">Page not found</h1>
        <p className="max-w-xl text-sm text-[var(--faint)] md:text-base">
          The page you requested does not exist or may have been moved.
        </p>
        <Link
          href="/"
          className={[
            "inline-flex items-center rounded-xl bg-[var(--action)] px-5 py-3 text-sm " +
              "font-semibold text-[var(--action-contrast)]",
            "transition hover:bg-[var(--action-strong)] focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-[var(--accent-line)] focus-visible:ring-offset-2 ring-offset-[var(--ground)]"
          ].join(" ")}
          title="Return to Domus home page."
        >
          Back to home
        </Link>
      </main>
    </LandingShell>
  );
}
