"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Star,
} from "lucide-react";
import { AnimateOnScroll } from "./animate-on-scroll";
import { AnimatedTabs } from "@/components/ui/animated-tabs";
import {
  faqs,
  featureTabs,
  problemCards,
  sectionCopyClass,
  sectionHeadingClass,
  sectionKickerClass,
  softSurfaceClass,
  steps,
  surfaceClass,
  testimonials,
  tiers
} from "./landing-content";

export function LandingPage() {
  const [activeTab, setActiveTab] = useState<(typeof featureTabs)[number]["id"]>("payments");
  const activeFeature = useMemo(
    () => featureTabs.find((tab) => tab.id === activeTab) ?? featureTabs[0],
    [activeTab]
  );

  return (
    <main id="main-content" className="mx-auto flex w-full max-w-7xl flex-col gap-20 px-6 pb-20 pt-10 md:px-10">
      <AnimateOnScroll>
        <header className={`${surfaceClass} flex items-center justify-between px-5 py-4 backdrop-blur`}>
          <p className="text-lg font-semibold leading-none tracking-tight text-slate-900">Domus</p>
          <Link
            href="/login"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 transition hover:bg-violet-100"
            title="Open role-based sign in."
          >
            Sign in
            <ArrowRight className="h-4 w-4" />
          </Link>
        </header>
      </AnimateOnScroll>

      <AnimateOnScroll className="grid items-center gap-10 lg:grid-cols-[1.02fr_0.98fr]">
        <section className="space-y-6">
          <p className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
            Domus for landlords with 1-10 units
          </p>
          <div className="space-y-4">
            <h1 className="max-w-3xl text-5xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-6xl">
              Stop managing rentals in spreadsheets.
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-slate-700">
              Domus gives landlords with 1-10 units a professional command center for payments, tenants, and maintenance, for free.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-300/30 transition hover:-translate-y-0.5 hover:from-violet-700 hover:to-fuchsia-700"
              title="Start your Domus account."
            >
              Start free — no credit card
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              title="Jump to the feature showcase."
            >
              See how it works
            </a>
          </div>
          <p className="text-sm font-medium text-slate-700">
            Trusted by 500+ landlords managing 2,000+ units
          </p>
        </section>

        <section className="relative">
          <div className="absolute inset-0 rounded-[36px] bg-[radial-gradient(circle_at_20%_10%,rgba(124,58,237,0.18),transparent_36%),radial-gradient(circle_at_90%_90%,rgba(34,197,94,0.14),transparent_30%)] blur-2xl" />
          <div className="relative overflow-hidden rounded-[36px] border border-slate-900/10 bg-slate-950/95 p-6 shadow-[0_34px_90px_-44px_rgba(15,23,42,0.6)]">
            <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Occupancy", "96%", "text-cyan-300"],
                    ["Collected", "$9.4k", "text-emerald-300"],
                    ["Open tickets", "4", "text-amber-200"],
                    ["Late rent", "$425", "text-rose-300"]
                  ].map(([label, value, color], index) => (
                    <div
                      key={label}
                      className="animate-in slide-in-from-bottom-2 rounded-2xl border border-white/10 bg-white/5 p-4 duration-300"
                      style={{ animationDelay: `${index * 120}ms` }}
                    >
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{label}</p>
                      <p className={`mt-2 text-2xl font-semibold ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    <span>Rent collection this month</span>
                    <span>87%</span>
                  </div>
                  <div className="mt-3 h-3 rounded-full bg-white/10">
                    <div className="h-3 w-[87%] rounded-full bg-gradient-to-r from-violet-400 via-fuchsia-300 to-cyan-300" />
                  </div>
                  <div className="mt-4 grid grid-cols-6 gap-2">
                    {[44, 58, 65, 73, 84, 92].map((height, index) => (
                      <div key={index} className="flex items-end rounded-xl bg-white/5 p-1">
                        <div className="w-full rounded-lg bg-gradient-to-t from-violet-500 to-cyan-300" style={{ height: `${height}px` }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  ["Pat Williams", "Rent due in 3 days", "Pending"],
                  ["Sam Johnson", "Maintenance updated", "In progress"],
                  ["Casey Brown", "Lease packet signed", "Complete"]
                ].map(([name, detail, badge], index) => (
                  <div
                    key={name}
                    className="animate-in fade-in rounded-2xl border border-white/10 bg-white/5 p-4 duration-300"
                    style={{ animationDelay: `${index * 180}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{name}</p>
                        <p className="mt-1 text-xs text-slate-300">{detail}</p>
                      </div>
                      <span className="rounded-full bg-violet-500/20 px-3 py-1 text-[11px] text-violet-100">{badge}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </AnimateOnScroll>

      <AnimateOnScroll>
        <section className="rounded-[36px] bg-slate-50 px-6 py-8 sm:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            {problemCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <article
                  key={card.title}
                  className={`${surfaceClass} animate-in fade-in slide-in-from-bottom-2 space-y-4 p-6 duration-300 hover:-translate-y-1`}
                  style={{ animationDelay: `${index * 120}ms` }}
                >
                  <div className="inline-flex rounded-2xl border border-violet-200 bg-violet-50 p-3">
                    <Icon className="h-5 w-5 text-violet-700" />
                  </div>
                  <h2 className="text-xl font-semibold text-slate-900">{card.title}</h2>
                  <p className="text-sm leading-relaxed text-slate-700">{card.body}</p>
                </article>
              );
            })}
          </div>
        </section>
      </AnimateOnScroll>

      <AnimateOnScroll>
        <section id="features" className="space-y-8">
          <div className="space-y-3">
            <p className={sectionKickerClass}>Feature Showcase</p>
            <h2 className={sectionHeadingClass}>One platform, five critical workflows.</h2>
            <p className={sectionCopyClass}>
              Domus replaces the disconnected tools landlords usually stitch together when their portfolio grows beyond memory.
            </p>
          </div>
          <AnimatedTabs
            tabs={featureTabs.map((tab) => ({
              id: tab.id,
              label: tab.label,
              icon: <tab.icon className="h-4 w-4" />
            }))}
            activeTab={activeTab}
            onTabChange={(tabId) => setActiveTab(tabId as (typeof featureTabs)[number]["id"])}
            className="border-b border-slate-200 pb-2"
            activeClassName="text-slate-900"
            inactiveClassName="text-slate-500 hover:text-slate-900"
            indicatorClassName="bg-violet-600"
          />
          <div className={`${softSurfaceClass} grid gap-6 p-6 lg:grid-cols-[0.95fr_1.05fr]`}>
            <div className="space-y-5">
              <div>
                <h3 className="text-3xl font-semibold text-slate-900">{activeFeature.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-slate-700">{activeFeature.body}</p>
              </div>
              <ul className="space-y-3 text-sm text-slate-700">
                {activeFeature.points.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <BadgeCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>{activeFeature.mock}</div>
          </div>
        </section>
      </AnimateOnScroll>

      <AnimateOnScroll>
        <section className="space-y-8">
          <div className="space-y-3 text-center">
            <p className={sectionKickerClass}>How It Works</p>
            <h2 className={sectionHeadingClass}>Get operational in four steps.</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className={`relative ${surfaceClass} p-6 text-center`}>
                  {index < steps.length - 1 ? (
                    <div className="absolute left-[58%] top-9 hidden h-px w-full border-t border-dashed border-slate-200 md:block" />
                  ) : null}
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-700">
                    <Icon className="h-6 w-6" />
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-violet-700">0{index + 1}</p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-sm text-slate-700">{step.body}</p>
                </div>
              );
            })}
          </div>
        </section>
      </AnimateOnScroll>

      <AnimateOnScroll>
        <section className="space-y-8">
          <div className="space-y-3">
            <p className={sectionKickerClass}>Testimonials</p>
            <h2 className={sectionHeadingClass}>Built for real owners, managers, and tenants.</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {testimonials.map((testimonial) => (
              <article key={testimonial.name} className={`${surfaceClass} border-l-4 border-l-violet-300 p-6`}>
                <div className="flex gap-1 text-amber-500">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-slate-700">“{testimonial.body}”</p>
                <div className="mt-5 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{testimonial.name}</p>
                    <p className="text-xs text-slate-500">Domus customer</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                    {testimonial.role}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </AnimateOnScroll>

      <AnimateOnScroll>
        <section className="space-y-8">
          <div className="space-y-3 text-center">
            <p className={sectionKickerClass}>Pricing</p>
            <h2 className={sectionHeadingClass}>Start simple, upgrade when your portfolio does.</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-4">
            {tiers.map((tier) => (
              <article
                key={tier.name}
                className={`relative rounded-[28px] border p-6 shadow-[0_18px_46px_-36px_rgba(15,23,42,0.18)] ${
                  tier.featured
                    ? "border-violet-200 bg-[linear-gradient(180deg,rgba(124,58,237,0.1)_0%,rgba(255,255,255,1)_100%)]"
                    : "border-slate-200 bg-white"
                }`}
              >
                {tier.featured ? (
                  <span className="absolute right-4 top-4 rounded-full bg-violet-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                    Most Popular
                  </span>
                ) : null}
                <h3 className="text-2xl font-semibold text-slate-900">{tier.name}</h3>
                <p className="mt-4 text-4xl font-semibold text-violet-700">{tier.price}</p>
                <p className="mt-1 text-sm text-slate-700">{tier.detail}</p>
                <ul className="mt-6 space-y-3 text-sm text-slate-700">
                  {tier.points.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <BadgeCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className={`mt-6 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    tier.featured
                      ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700"
                      : "border border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100"
                  }`}
                  title={`Start the ${tier.name} plan.`}
                >
                  {tier.price === "$0" ? "Get Started" : tier.price === "Custom" ? "Contact Sales" : "Start Trial"}
                </Link>
              </article>
            ))}
          </div>
          <p className="text-center text-sm text-slate-700">
            All plans include unlimited tenants, SSL encryption, and 99.9% uptime.
          </p>
        </section>
      </AnimateOnScroll>

      <AnimateOnScroll>
        <section className="space-y-6">
          <div className="space-y-3">
            <p className={sectionKickerClass}>FAQ</p>
            <h2 className={sectionHeadingClass}>Answers before you commit.</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((item) => (
              <details key={item.q} className={`${surfaceClass} group p-5`}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-left text-base font-medium text-slate-900">
                  <span>{item.q}</span>
                  <span className="text-violet-600 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-4 text-sm leading-relaxed text-slate-700">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </AnimateOnScroll>

      <AnimateOnScroll>
        <section className="rounded-[36px] bg-[linear-gradient(135deg,rgba(124,58,237,0.12)_0%,rgba(168,85,247,0.08)_45%,rgba(34,197,94,0.08)_100%)] p-8 text-center ring-1 ring-violet-200 md:p-12">
          <p className={sectionKickerClass}>Final CTA</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">
            Ready to professionalize your rental business?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-700">
            Free for up to 3 units. No credit card required.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:from-violet-700 hover:to-fuchsia-700"
            title="Start your Domus account."
          >
            Get started now
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </AnimateOnScroll>

      <footer className="rounded-[32px] bg-[#f1f5f9] px-6 py-8 text-sm text-slate-700">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-base font-semibold text-slate-900">Domus</p>
            <p>Built with care for independent landlords.</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="transition hover:text-slate-900" title="Read Domus terms of service.">
              Terms
            </Link>
            <Link href="/privacy" className="transition hover:text-slate-900" title="Read Domus privacy policy.">
              Privacy
            </Link>
            <a href="#" className="transition hover:text-slate-900" title="Open help resources.">
              Help
            </a>
          </div>
        </div>
        <p className="mt-4">
          © {new Date().getFullYear()} Domus. Professional rental operations for independent landlords.
        </p>
      </footer>
    </main>
  );
}
