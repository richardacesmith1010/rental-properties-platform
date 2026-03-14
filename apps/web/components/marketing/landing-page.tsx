"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CreditCard,
  FileStack,
  LineChart,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  Trophy,
  UserPlus,
  Users,
  WalletCards,
  Wrench
} from "lucide-react";
import { AnimateOnScroll } from "./animate-on-scroll";
import { AnimatedTabs } from "@/components/ui/animated-tabs";

const problemCards = [
  {
    icon: WalletCards,
    title: "Spreadsheets can't track payments",
    body: "Domus automates rent collection, shows overdue balances instantly, and keeps every charge tied to the right lease."
  },
  {
    icon: Users,
    title: "Texts and emails get lost",
    body: "Domus centralizes tenant communication, notifications, and document workflows so nothing disappears in a personal inbox."
  },
  {
    icon: Wrench,
    title: "Maintenance falls through cracks",
    body: "Domus tracks every ticket from submission to resolution with clear status updates for landlords, managers, and tenants."
  }
];

const featureTabs = [
  {
    id: "payments",
    label: "Payments",
    icon: CreditCard,
    title: "Collect rent with less follow-up",
    body: "Track charges, autopay, manual payments, and collections performance from one owner-grade dashboard.",
    points: [
      "Stripe checkout and autopay enrollment",
      "Late rent tracking with reminders and escalation",
      "Receipts, ledgers, and payment history"
    ],
    mock: (
      <div className="grid gap-3 rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Collected</p>
            <p className="mt-2 text-3xl font-semibold text-white">$8,200</p>
          </div>
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-rose-200">Overdue</p>
            <p className="mt-2 text-3xl font-semibold text-white">$425</p>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between text-sm text-slate-300"><span>Autopay enabled</span><span>78%</span></div>
          <div className="mt-3 h-2 rounded-full bg-white/10"><div className="h-2 w-[78%] rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300" /></div>
        </div>
      </div>
    )
  },
  {
    id: "maintenance",
    label: "Maintenance",
    icon: Ticket,
    title: "Show progress instead of sending excuses",
    body: "Give tenants a real-time maintenance tracker while keeping owners and managers aligned on assignments, updates, and costs.",
    points: [
      "Pizza-tracker style ticket timeline",
      "Comments, photos, priorities, and vendors",
      "Resolution metrics for operations visibility"
    ],
    mock: (
      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        <div className="flex items-center justify-between text-sm text-slate-300">
          <span>AC not cooling</span>
          <span className="rounded-full bg-violet-500/20 px-3 py-1 text-violet-100">In Progress</span>
        </div>
        <div className="mt-5 flex items-center gap-2">
          {[
            { label: "Submitted", done: true },
            { label: "Reviewed", done: true },
            { label: "In Progress", done: true },
            { label: "Resolved", done: false },
            { label: "Closed", done: false }
          ].map(({ label, done }, index) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div className={`h-4 w-4 rounded-full border ${done ? "border-violet-300 bg-violet-300" : "border-slate-500 bg-transparent"}`} />
              {index < 4 ? <div className={`h-[2px] flex-1 ${done ? "bg-violet-300" : "bg-slate-700"}`} /> : null}
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-slate-400">
          <div>Submitted<br />Mar 10</div>
          <div>Reviewed<br />Mar 10</div>
          <div>Vendor on site<br />Mar 11</div>
        </div>
      </div>
    )
  },
  {
    id: "documents",
    label: "Documents",
    icon: FileStack,
    title: "Get signatures without chasing PDFs",
    body: "Create reusable templates, send packets for signature, and keep a property file vault with controlled tenant visibility.",
    points: [
      "Reusable lease, notice, and addendum templates",
      "Packet tracking from draft to signed",
      "Property-level file vault for receipts and records"
    ],
    mock: (
      <div className="space-y-3 rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        {[
          ["Lease renewal packet", "Sent"],
          ["Move-out checklist", "Draft"],
          ["Insurance certificate", "Signed"]
        ].map(([title, status]) => (
          <div key={title} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">{title}</p>
              <p className="text-xs text-slate-400">Ready for tenant workflow</p>
            </div>
            <span className="rounded-full bg-violet-500/20 px-3 py-1 text-xs text-violet-100">{status}</span>
          </div>
        ))}
      </div>
    )
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: LineChart,
    title: "See the health of your portfolio fast",
    body: "Owners and managers get clean visibility into occupancy, revenue, expenses, delinquency, and property-level performance.",
    points: [
      "Revenue, occupancy, and maintenance charts",
      "Expense tracking and monthly P&L",
      "Financial reports ready for export"
    ],
    mock: (
      <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        <div className="grid grid-cols-3 gap-3">
          {["Occupancy", "Revenue", "Net"].map((metric) => (
            <div key={metric} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{metric}</p>
              <p className="mt-2 text-xl font-semibold text-white">{metric === "Occupancy" ? "96%" : metric === "Revenue" ? "$9.1k" : "$5.3k"}</p>
            </div>
          ))}
        </div>
        <div className="flex h-40 items-end gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          {[55, 72, 61, 84, 70, 92, 88].map((height, index) => (
            <div key={index} className="flex-1 rounded-t-2xl bg-gradient-to-t from-violet-500 to-cyan-300/80" style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>
    )
  },
  {
    id: "gamification",
    label: "Gamification",
    icon: Trophy,
    title: "Reward tenants for doing the right thing",
    body: "Domus turns on-time rent, document completion, and good tenant behavior into visible progress that people actually care about.",
    points: [
      "XP, levels, streaks, and achievement badges",
      "Celebration moments for on-time payments",
      "A tenant experience people remember"
    ],
    mock: (
      <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
          <div className="flex items-center justify-between text-sm text-violet-100">
            <span>Level 3 Tenant</span>
            <span>2,450 XP</span>
          </div>
          <div className="mt-3 h-3 rounded-full bg-white/10">
            <div className="h-3 w-[72%] rounded-full bg-gradient-to-r from-violet-400 via-fuchsia-300 to-amber-300" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center text-xs text-slate-300">
              <Sparkles className="mx-auto h-5 w-5 text-amber-300" />
              <p className="mt-2">Achievement</p>
            </div>
          ))}
        </div>
      </div>
    )
  }
] as const;

const steps = [
  { icon: UserPlus, title: "Create your account", body: "Pick your role and get into the dashboard in minutes." },
  { icon: Building2, title: "Add your properties", body: "Set up units, ownership, and the records you already manage." },
  { icon: Users, title: "Invite your tenants", body: "Bring tenants and managers into the same operational system." },
  { icon: CreditCard, title: "Collect rent automatically", body: "Track due dates, autopay, receipts, and delinquency without a spreadsheet." }
];

const testimonials = [
  { name: "Alex R.", role: "Owner", border: "border-violet-400/40", body: "I manage 6 units and finally stopped using spreadsheets. Domus pays for itself with the time I save on rent tracking alone." },
  { name: "Jordan K.", role: "Manager", border: "border-emerald-400/40", body: "The maintenance tracker is a game changer. My tenants love seeing their ticket progress in real-time." },
  { name: "Sam T.", role: "Tenant", border: "border-amber-400/40", body: "As a tenant, I actually enjoy paying rent now. The gamification makes me feel good about paying on time." }
];

const tiers = [
  {
    name: "Free",
    price: "$0",
    detail: "forever",
    points: ["Up to 3 units", "Owner dashboard", "Maintenance tickets", "Tenant portal"]
  },
  {
    name: "Starter",
    price: "$29",
    detail: "per month",
    points: ["Up to 15 units", "Stripe rent collection", "Document signing", "Full reporting"]
  },
  {
    name: "Growth",
    price: "$79",
    detail: "per month",
    points: ["Up to 75 units", "Manager role access", "Advanced maintenance workflows", "Priority support"],
    featured: true
  },
  {
    name: "Scale",
    price: "Custom",
    detail: "annual contract",
    points: ["Unlimited units", "Dedicated onboarding", "API access", "Custom reporting"]
  }
];

const faqs = [
  {
    q: "Is Domus really free for small landlords?",
    a: "Yes. Landlords managing up to 3 units can use the core platform for free. Paid plans unlock more scale, reporting, and team workflows."
  },
  {
    q: "How does rent collection work?",
    a: "Tenants can pay through Stripe-powered checkout or saved autopay. Owners and managers see payment status, receipts, and aging in the dashboard."
  },
  {
    q: "Can I manage multiple properties?",
    a: "Yes. Domus is built for landlords and managers handling multiple units and properties without needing separate spreadsheets or systems."
  },
  {
    q: "Is my data secure?",
    a: "Domus uses role-based permissions, encrypted transport, audit logging, and production-grade hosting patterns so each user only sees what they should."
  },
  {
    q: "What happens when a tenant doesn't pay?",
    a: "Charges stay visible, reminders and delinquency escalation can trigger automatically, and owners get clean reporting on who owes what and for how long."
  },
  {
    q: "Can my property manager use Domus?",
    a: "Yes. Managers get their own focused dashboard with access only to the properties they administer, while owners keep full financial visibility."
  }
];

export function LandingPage() {
  const [activeTab, setActiveTab] = useState<(typeof featureTabs)[number]["id"]>("payments");
  const activeFeature = useMemo(
    () => featureTabs.find((tab) => tab.id === activeTab) ?? featureTabs[0],
    [activeTab]
  );

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-20 px-6 pb-20 pt-10 md:px-10">
      <AnimateOnScroll>
        <header className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur">
          <div>
            <p className="text-lg font-semibold tracking-tight text-violet-100">Domus</p>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Rental command center</p>
          </div>
          <Link href="/login" className="inline-flex items-center gap-2 rounded-xl border border-violet-300/30 bg-violet-500/20 px-4 py-2 text-sm font-medium text-violet-100 transition hover:bg-violet-500/30" title="Open role-based sign in.">
            Sign in
            <ArrowRight className="h-4 w-4" />
          </Link>
        </header>
      </AnimateOnScroll>

      <AnimateOnScroll className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6">
          <p className="inline-flex rounded-full border border-violet-300/30 bg-violet-400/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">
            Domus for landlords with 1-10 units
          </p>
          <div className="space-y-4">
            <h1 className="max-w-3xl text-5xl font-semibold leading-tight tracking-tight text-white sm:text-6xl">
              Stop managing rentals in spreadsheets.
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-slate-300">
              Domus gives landlords with 1-10 units a professional command center for payments, tenants, and maintenance, for free.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/login" className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-900/40" title="Start your Domus account.">
              Start free — no credit card
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#features" className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10" title="Jump to the feature showcase.">
              See how it works
            </a>
          </div>
          <p className="text-sm text-slate-400">Trusted by 500+ landlords managing 2,000+ units</p>
        </section>

        <section className="relative">
          <div className="absolute inset-0 rounded-[32px] bg-gradient-to-br from-violet-500/30 via-cyan-400/10 to-transparent blur-2xl" />
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-violet-950/40 backdrop-blur">
            <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Occupancy", "96%", "text-cyan-300"],
                    ["Collected", "$9.4k", "text-emerald-300"],
                    ["Open tickets", "4", "text-amber-200"],
                    ["Late rent", "$425", "text-rose-300"]
                  ].map(([label, value, color], index) => (
                    <div key={label} className="animate-in slide-in-from-bottom-2 rounded-2xl border border-white/10 bg-white/5 p-4 duration-300" style={{ animationDelay: `${index * 120}ms` }}>
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
                  <div key={name} className="animate-in fade-in rounded-2xl border border-white/10 bg-white/5 p-4 duration-300" style={{ animationDelay: `${index * 180}ms` }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{name}</p>
                        <p className="mt-1 text-xs text-slate-400">{detail}</p>
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
        <section className="grid gap-4 md:grid-cols-3">
          {problemCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <article key={card.title} className="domus-card animate-in fade-in slide-in-from-bottom-2 space-y-4 p-6 duration-300 hover:-translate-y-1 hover:border-violet-300/30" style={{ animationDelay: `${index * 120}ms` }}>
                <div className="inline-flex rounded-2xl border border-violet-300/20 bg-violet-500/10 p-3">
                  <Icon className="h-5 w-5 text-violet-200" />
                </div>
                <h2 className="text-xl font-semibold text-white">{card.title}</h2>
                <p className="text-sm leading-relaxed text-slate-300">{card.body}</p>
              </article>
            );
          })}
        </section>
      </AnimateOnScroll>

      <AnimateOnScroll>
        <section id="features" className="space-y-8">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200">Feature Showcase</p>
            <h2 className="text-4xl font-semibold tracking-tight text-white">One platform, five critical workflows.</h2>
            <p className="max-w-3xl text-slate-300">Domus replaces the disconnected tools landlords usually stitch together when their portfolio grows beyond memory.</p>
          </div>
          <AnimatedTabs
            tabs={featureTabs.map((tab) => ({
              id: tab.id,
              label: tab.label,
              icon: <tab.icon className="h-4 w-4" />,
            }))}
            activeTab={activeTab}
            onTabChange={(tabId) => setActiveTab(tabId as (typeof featureTabs)[number]["id"])}
            className="border-b border-white/10 pb-2"
            activeClassName="text-violet-100"
            inactiveClassName="text-slate-300 hover:text-white"
            indicatorClassName="bg-violet-300"
          />
          <div className="grid gap-6 rounded-[32px] border border-white/10 bg-white/[0.03] p-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-5">
              <div>
                <h3 className="text-3xl font-semibold text-white">{activeFeature.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-slate-300">{activeFeature.body}</p>
              </div>
              <ul className="space-y-3 text-sm text-slate-200">
                {activeFeature.points.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <BadgeCheck className="mt-0.5 h-4 w-4 text-emerald-300" />
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
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200">How It Works</p>
            <h2 className="text-4xl font-semibold tracking-tight text-white">Get operational in four steps.</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="relative domus-card p-6 text-center">
                  {index < steps.length - 1 ? <div className="absolute left-[58%] top-9 hidden h-px w-full border-t border-dashed border-white/15 md:block" /> : null}
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-violet-300/20 bg-violet-500/10 text-violet-100">
                    <Icon className="h-6 w-6" />
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">0{index + 1}</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm text-slate-300">{step.body}</p>
                </div>
              );
            })}
          </div>
        </section>
      </AnimateOnScroll>

      <AnimateOnScroll>
        <section className="space-y-8">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200">Testimonials</p>
            <h2 className="text-4xl font-semibold tracking-tight text-white">Built for real owners, managers, and tenants.</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {testimonials.map((testimonial) => (
              <article key={testimonial.name} className={`domus-card border-l-4 ${testimonial.border} p-6`}>
                <div className="flex gap-1 text-amber-300">
                  {Array.from({ length: 5 }).map((_, index) => <Star key={index} className="h-4 w-4 fill-current" />)}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-slate-200">“{testimonial.body}”</p>
                <div className="mt-5 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white">{testimonial.name}</p>
                    <p className="text-xs text-slate-400">Domus customer</p>
                  </div>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-200">{testimonial.role}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </AnimateOnScroll>

      <AnimateOnScroll>
        <section className="space-y-8">
          <div className="space-y-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200">Pricing</p>
            <h2 className="text-4xl font-semibold tracking-tight text-white">Start simple, upgrade when your portfolio does.</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-4">
            {tiers.map((tier) => (
              <article key={tier.name} className={`relative rounded-[28px] border p-6 ${tier.featured ? "border-violet-300/50 bg-gradient-to-b from-violet-500/15 to-white/[0.03] shadow-xl shadow-violet-950/25" : "border-white/10 bg-white/[0.03]"}`}>
                {tier.featured ? <span className="absolute right-4 top-4 rounded-full bg-violet-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">Most Popular</span> : null}
                <h3 className="text-2xl font-semibold text-white">{tier.name}</h3>
                <p className="mt-4 text-4xl font-semibold text-violet-100">{tier.price}</p>
                <p className="mt-1 text-sm text-slate-400">{tier.detail}</p>
                <ul className="mt-6 space-y-3 text-sm text-slate-200">
                  {tier.points.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <BadgeCheck className="mt-0.5 h-4 w-4 text-emerald-300" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/login" className={`mt-6 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${tier.featured ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white" : "border border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"}`} title={`Start the ${tier.name} plan.`}>
                  {tier.price === "$0" ? "Get Started" : tier.price === "Custom" ? "Contact Sales" : "Start Trial"}
                </Link>
              </article>
            ))}
          </div>
          <p className="text-center text-sm text-slate-400">All plans include unlimited tenants, SSL encryption, and 99.9% uptime.</p>
        </section>
      </AnimateOnScroll>

      <AnimateOnScroll>
        <section className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-200">FAQ</p>
            <h2 className="text-4xl font-semibold tracking-tight text-white">Answers before you commit.</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((item) => (
              <details key={item.q} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-left text-base font-medium text-white">
                  <span>{item.q}</span>
                  <span className="text-violet-200 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-4 text-sm leading-relaxed text-slate-300">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </AnimateOnScroll>

      <AnimateOnScroll>
        <section className="rounded-[32px] border border-violet-300/20 bg-gradient-to-r from-violet-500/20 via-fuchsia-500/10 to-cyan-400/15 p-8 text-center md:p-12">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-100">Final CTA</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white">Ready to professionalize your rental business?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-200">Free for up to 3 units. No credit card required.</p>
          <Link href="/login" className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-slate-100" title="Start your Domus account.">
            Get started now
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </AnimateOnScroll>

      <footer className="border-t border-white/10 pt-8 text-sm text-slate-400">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-base font-semibold text-violet-100">Domus</p>
            <p>Built with ❤️ for independent landlords.</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="transition hover:text-white" title="Read Domus terms of service.">Terms</Link>
            <Link href="/privacy" className="transition hover:text-white" title="Read Domus privacy policy.">Privacy</Link>
            <a href="#" className="transition hover:text-white" title="Open help resources.">Help</a>
          </div>
        </div>
        <p className="mt-4">© {new Date().getFullYear()} Domus. Professional rental operations for independent landlords.</p>
      </footer>
    </main>
  );
}
