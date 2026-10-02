import Link from "next/link";
import { Home } from "lucide-react";
import { AnimateOnScroll } from "./animate-on-scroll";
import { Button } from "@/components/ui/button";
import { faqs, featureCards, problemCards, steps } from "./landing-content";

const containerClass = "mx-auto w-full max-w-[1120px] px-6";
const sectionClass = `${containerClass} py-16 sm:py-[72px]`;

export function LandingPage() {
  return (
    <main id="main-content" className="overflow-x-hidden">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className={`${containerClass} flex flex-wrap items-center justify-between gap-4 py-4`}>
          <a href="#top" className="flex items-center gap-2.5 text-lg font-bold text-[var(--ink)]" title="Go to the top of the page.">
            <Home className="h-7 w-7 text-[var(--accent)]" aria-hidden="true" /> Domus
          </a>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-[var(--ink-2)]" aria-label="Main navigation">
            <a href="#features" className="hover:text-[var(--ink)]" title="See what Domus does.">What it does</a>
            <a href="#how" className="hover:text-[var(--ink)]" title="See how Domus works.">How it works</a>
            <a href="#faq" className="hover:text-[var(--ink)]" title="Read common questions.">Questions</a>
            <Button asChild variant="outline"><Link href="/login" title="Sign in to Domus.">Sign in</Link></Button>
          </nav>
        </div>
      </header>

      <AnimateOnScroll className={`${sectionClass} grid items-center gap-12 lg:grid-cols-2`}>
        <section id="top" className="flex flex-col gap-5">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">For landlords with a few units</p>
          <h1 className="text-4xl font-bold leading-[1.08] tracking-[-0.02em] sm:text-[52px]">Rent, repairs, and leases. All in one place.</h1>
          <p className="max-w-[520px] text-lg leading-relaxed text-[var(--ink-2)] sm:text-[19px]">Tenants pay online. You see who paid. Problems get fixed. No more spreadsheets.</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild size="lg"><Link href="/login" title="Start using Domus for free.">Start free</Link></Button>
            <Button asChild size="lg" variant="outline"><a href="#how" title="See how Domus works.">See how it works</a></Button>
          </div>
          <p className="text-sm text-[var(--muted)]">Free while Domus is in early access. No credit card.</p>
        </section>

        <section className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)] sm:p-6" aria-label="Sample rent overview">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold">October rent</h2>
            <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)]">Sample</span>
          </div>
          <div className="mt-5">
            <div className="flex flex-wrap items-baseline gap-2"><strong className="text-[34px] tracking-[-0.02em]">$3,450</strong><span className="text-[15px] text-[var(--muted)]">paid of $4,800</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full w-[72%] rounded-full bg-[var(--pos)]" /></div>
          </div>
          <div className="mt-5 overflow-hidden rounded-xl border border-[var(--line)]">
            <SampleRow title="Unit 2A" detail="$1,150 · paid Oct 1" badge="Paid" tone="positive" />
            <SampleRow title="Unit 3" detail="$1,350 · due Oct 5" badge="Due soon" tone="warning" />
            <SampleRow title="Unit 1B" detail="Sink is leaking · sent today" badge="New problem" />
          </div>
        </section>
      </AnimateOnScroll>

      <section className="border-y border-[var(--line)] bg-[var(--surface)]">
        <AnimateOnScroll className={`${containerClass} py-16`}>
          <h2 className="text-3xl font-bold tracking-[-0.01em]">Sound familiar?</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {problemCards.map((card) => <article key={card.title} className="rounded-[14px] border border-[var(--line)] bg-[var(--ground)] p-6"><h3 className="text-lg font-semibold">{card.title}</h3><p className="mt-2 leading-relaxed text-[var(--ink-2)]">{card.body}</p></article>)}
          </div>
        </AnimateOnScroll>
      </section>

      <AnimateOnScroll className={sectionClass}>
        <section id="features">
          <h2 className="text-3xl font-bold tracking-[-0.01em]">What Domus does</h2>
          <p className="mt-2 text-[17px] text-[var(--ink-2)]">The basics, done well.</p>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {featureCards.map((card) => {
              const Icon = card.icon!;
              return <article key={card.title} className="flex gap-4 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-6"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)]"><Icon className="h-[22px] w-[22px] text-[var(--ink-2)]" aria-hidden="true" /></div><div><h3 className="text-[17px] font-semibold">{card.title}</h3><p className="mt-1.5 leading-relaxed text-[var(--ink-2)]">{card.body}</p></div></article>;
            })}
          </div>
        </section>
      </AnimateOnScroll>

      <section id="how" className="border-y border-[var(--line)] bg-[var(--surface)]">
        <AnimateOnScroll className={`${containerClass} py-[72px]`}>
          <h2 className="text-3xl font-bold tracking-[-0.01em]">How it works</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => <article key={step.title}><div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] font-bold text-[var(--accent)]">{index + 1}</div><h3 className="mt-2.5 text-[17px] font-semibold">{step.title}</h3><p className="mt-2 leading-relaxed text-[var(--ink-2)]">{step.body}</p></article>)}
          </div>
        </AnimateOnScroll>
      </section>

      <AnimateOnScroll className={`${containerClass} pt-[72px]`}>
        <section className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 sm:p-10">
          <div className="min-w-0 flex-1 basis-[360px]"><h2 className="text-[28px] font-bold tracking-[-0.01em]">Free while Domus is in early access</h2><p className="mt-2 text-[17px] text-[var(--ink-2)]">No credit card needed. Set up your first home today.</p></div>
          <Button asChild size="lg"><Link href="/login" title="Start using Domus for free.">Start free</Link></Button>
        </section>
      </AnimateOnScroll>

      <AnimateOnScroll className="mx-auto w-full max-w-[760px] px-6 py-[72px]">
        <section id="faq">
          <h2 className="text-3xl font-bold tracking-[-0.01em]">Questions</h2>
          <div className="mt-6 border-t border-[var(--line)]">
            {faqs.map((item, index) => <details key={item.q} open={index === 0} className="border-b border-[var(--line)] py-[18px]"><summary className="cursor-pointer text-[17px] font-semibold">{item.q}</summary><p className="mt-2.5 leading-relaxed text-[var(--ink-2)]">{item.a}</p></details>)}
          </div>
        </section>
      </AnimateOnScroll>

      <footer className="border-t border-[var(--line)] bg-[var(--surface)]">
        <div className={`${containerClass} flex flex-wrap items-center justify-between gap-4 py-7 text-sm text-[var(--muted)]`}>
          <span>© 2026 Domus</span>
          <nav className="flex gap-5" aria-label="Footer navigation"><Link href="/terms" className="hover:text-[var(--ink)]" title="Read the terms of service.">Terms</Link><Link href="/privacy" className="hover:text-[var(--ink)]" title="Read the privacy policy.">Privacy</Link><a href="mailto:support@domusbase.com" className="hover:text-[var(--ink)]" title="Email Domus support.">Help</a></nav>
        </div>
      </footer>
    </main>
  );
}

function SampleRow({ title, detail, badge, tone = "neutral" }: { title: string; detail: string; badge: string; tone?: "positive" | "warning" | "neutral" }) {
  const badgeClass = tone === "positive" ? "bg-[var(--pos-bg)] text-[var(--pos)]" : tone === "warning" ? "bg-[var(--warn-bg)] text-[var(--warn)]" : "bg-[var(--surface-2)] text-[var(--ink-2)]";
  return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3.5 last:border-b-0"><div><h3 className="text-[15px] font-semibold">{title}</h3><p className="text-[13px] text-[var(--muted)]">{detail}</p></div><span className={`rounded-full px-2.5 py-1 text-[13px] font-semibold ${badgeClass}`}>{badge}</span></div>;
}
