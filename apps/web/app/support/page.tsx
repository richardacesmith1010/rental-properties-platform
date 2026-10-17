import Link from "next/link";

export default function SupportPage() {
  return <main id="main-content" className="app-surface min-h-screen px-5 py-10 text-[var(--ink)]">
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-3xl font-bold">Get help</h1>
      <div className="space-y-5">
        <section><h2 className="font-semibold">Can’t sign in?</h2>
          <p>Use <Link href="/login" className="underline">Forgot password</Link> on the sign-in page.</p></section>
        <section><h2 className="font-semibold">How do I pay rent?</h2>
          <p>Sign in and open Payments.</p></section>
        <section><h2 className="font-semibold">How do I report a repair?</h2>
          <p>Sign in and open Maintenance.</p></section>
        <section><h2 className="font-semibold">How do I delete my account?</h2>
          <p>Sign in and open Settings. Tap Your data, then Delete my account. Owners tap Account &amp; Data instead.</p>
        </section>
        <section><h2 className="font-semibold">Have a privacy question?</h2>
          <p>Email <a href="mailto:privacy@domusbase.com" className="underline">privacy@domusbase.com</a>.</p></section>
      </div>
      <p>Need more help? Email <a href="mailto:support@domusbase.com" className="underline">support@domusbase.com</a>.</p>
    </div>
  </main>;
}
