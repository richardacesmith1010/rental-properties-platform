import Link from "next/link";
import {
  Building2,
  CreditCard,
  ShieldCheck,
  Ticket,
  Users,
  WalletCards,
  ArrowRight
} from "lucide-react";

const features = [
  {
    title: "Property Management",
    description: "Track properties, units, leases, and occupancy in one operational workspace.",
    icon: Building2
  },
  {
    title: "Stripe Tenant Payments",
    description: "Collect rent securely with Stripe-powered checkout and payment tracking.",
    icon: CreditCard
  },
  {
    title: "Maintenance Tickets",
    description: "Handle requests, route work, and close tickets with full timeline visibility.",
    icon: Ticket
  },
  {
    title: "Manager Dashboards",
    description: "Give managers focused access to operations without exposing owner-only controls.",
    icon: Users
  },
  {
    title: "Role-Based Access",
    description: "Owner, Manager, and Tenant experiences are separated by role and permissions.",
    icon: ShieldCheck
  },
  {
    title: "Portfolio Cashflow",
    description: "Stay ahead of late rent, incoming payments, and monthly revenue performance.",
    icon: WalletCards
  }
];

const tiers = [
  {
    name: "Starter",
    price: "$49",
    detail: "per month",
    points: ["1-10 units", "Owner dashboard", "Stripe rent collection"]
  },
  {
    name: "Growth",
    price: "$149",
    detail: "per month",
    points: ["Up to 75 units", "Manager role access", "Advanced maintenance workflows"],
    featured: true
  },
  {
    name: "Scale",
    price: "Custom",
    detail: "annual contract",
    points: ["Unlimited units", "Priority support", "Custom reporting + onboarding"]
  }
];

export default function RentFlowMarketingPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-20 px-6 pb-16 pt-10 md:px-10">
      <header className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur">
        <div className="text-lg font-semibold tracking-tight text-indigo-100">RentFlow</div>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-300/30 bg-indigo-500/20 px-4 py-2 text-sm font-medium text-indigo-100 transition hover:bg-indigo-500/30"
        >
          Sign in
          <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      <section className="grid items-center gap-10 lg:grid-cols-2">
        <div className="space-y-6">
          <p className="inline-flex rounded-full border border-indigo-300/30 bg-indigo-400/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200">
            Rental Operations SaaS
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
            Run your rental portfolio with confidence.
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
            RentFlow unifies property operations, tenant payments, and maintenance workflows for Owner,
            Manager, and Tenant roles in one elegant platform.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-sm text-slate-400">No setup friction. Role-based login included.</span>
          </div>
        </div>

        <div className="rounded-3xl border border-indigo-300/20 bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-slate-900 p-6 shadow-2xl shadow-indigo-900/30">
          <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/60 p-5">
            <div className="text-sm text-slate-400">Live Operational Snapshot</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-slate-400">Occupancy</div>
                <div className="mt-1 text-2xl font-semibold text-cyan-300">94%</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-slate-400">Collected</div>
                <div className="mt-1 text-2xl font-semibold text-emerald-300">$82.4k</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-slate-400">Open Tickets</div>
                <div className="mt-1 text-2xl font-semibold text-amber-200">7</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-slate-400">Late Rent</div>
                <div className="mt-1 text-2xl font-semibold text-rose-300">$1.9k</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-8">
        <div className="space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight text-white">Everything you need to operate rentals</h2>
          <p className="max-w-2xl text-slate-300">
            Built for operational speed with role-aware workflows and data you can trust.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-indigo-300/30 hover:bg-indigo-400/5"
              >
                <div className="mb-3 inline-flex rounded-lg border border-indigo-300/30 bg-indigo-400/10 p-2">
                  <Icon className="h-5 w-5 text-indigo-200" />
                </div>
                <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{feature.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="space-y-8">
        <div className="space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight text-white">Simple pricing as you scale</h2>
          <p className="text-slate-300">Start with essentials, expand when your portfolio grows.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {tiers.map((tier) => (
            <article
              key={tier.name}
              className={`rounded-2xl border p-6 ${
                tier.featured
                  ? "border-indigo-300/40 bg-indigo-500/10"
                  : "border-white/10 bg-white/[0.03]"
              }`}
            >
              <h3 className="text-xl font-semibold text-white">{tier.name}</h3>
              <p className="mt-3 text-3xl font-bold text-indigo-200">{tier.price}</p>
              <p className="text-sm text-slate-400">{tier.detail}</p>
              <ul className="mt-5 space-y-2 text-sm text-slate-300">
                {tier.points.map((point) => (
                  <li key={point}>• {point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-indigo-300/30 bg-gradient-to-r from-indigo-500/20 via-purple-500/10 to-indigo-500/20 p-8 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-white">Ready to run operations in RentFlow?</h2>
        <p className="mx-auto mt-3 max-w-2xl text-slate-300">
          Sign in with your role and start managing properties, payments, and tickets from one platform.
        </p>
        <div className="mt-6">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
          >
            Launch RentFlow
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/10 pt-8 text-sm text-slate-400">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} RentFlow. Rental management, simplified.</p>
          <p>Owner • Manager • Tenant</p>
        </div>
      </footer>
    </main>
  );
}
