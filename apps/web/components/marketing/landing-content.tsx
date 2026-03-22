import {
  Building2,
  CreditCard,
  FileStack,
  LineChart,
  Sparkles,
  Ticket,
  Trophy,
  UserPlus,
  Users,
  WalletCards,
  Wrench,
  type LucideIcon
} from "lucide-react";

export interface MarketingFeatureTab {
  id: string;
  label: string;
  icon: LucideIcon;
  title: string;
  body: string;
  points: string[];
  mock: JSX.Element;
}

export const problemCards = [
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

export const featureTabs: MarketingFeatureTab[] = [
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
      <div className="grid gap-3 rounded-3xl border border-white/10 bg-slate-950/92 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Collected</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-900">$8,200</p>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-rose-700">Overdue</p>
            <p className="mt-2 text-3xl font-semibold text-rose-900">$425</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-100 p-4">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Autopay enabled</span>
            <span>78%</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-200">
            <div className="h-2 w-[78%] rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300" />
          </div>
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
      <div className="rounded-3xl border border-white/10 bg-slate-950/92 p-5">
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
      <div className="space-y-3 rounded-3xl border border-white/10 bg-slate-950/92 p-5">
        {[
          ["Lease renewal packet", "Sent"],
          ["Move-out checklist", "Draft"],
          ["Insurance certificate", "Signed"]
        ].map(([title, status]) => (
          <div key={title} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900">{title}</p>
              <p className="text-xs text-slate-600">Ready for tenant workflow</p>
            </div>
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs text-violet-700">{status}</span>
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
      <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/92 p-5">
        <div className="grid grid-cols-3 gap-3">
          {["Occupancy", "Revenue", "Net"].map((metric) => (
            <div key={metric} className="rounded-2xl border border-slate-200 bg-slate-100 p-3 text-center">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-600">{metric}</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {metric === "Occupancy" ? "96%" : metric === "Revenue" ? "$9.1k" : "$5.3k"}
              </p>
            </div>
          ))}
        </div>
        <div className="flex h-40 items-end gap-3 rounded-2xl border border-slate-200 bg-slate-100 p-4">
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
      <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/92 p-5">
        <div className="rounded-2xl border border-violet-200 bg-violet-100 p-4">
          <div className="flex items-center justify-between text-sm text-violet-800">
            <span>Level 3 Tenant</span>
            <span>2,450 XP</span>
          </div>
          <div className="mt-3 h-3 rounded-full bg-violet-200">
            <div className="h-3 w-[72%] rounded-full bg-gradient-to-r from-violet-400 via-fuchsia-300 to-amber-300" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-slate-200 bg-slate-100 p-3 text-center text-xs text-slate-700">
              <Sparkles className="mx-auto h-5 w-5 text-amber-300" />
              <p className="mt-2">Achievement</p>
            </div>
          ))}
        </div>
      </div>
    )
  }
];

export const steps = [
  { icon: UserPlus, title: "Create your account", body: "Pick your role and get into the dashboard in minutes." },
  { icon: Building2, title: "Add your properties", body: "Set up units, ownership, and the records you already manage." },
  { icon: Users, title: "Invite your tenants", body: "Bring tenants and managers into the same operational system." },
  { icon: CreditCard, title: "Collect rent automatically", body: "Track due dates, autopay, receipts, and delinquency without a spreadsheet." }
];

export const testimonials = [
  { name: "Alex R.", role: "Owner", body: "I manage 6 units and finally stopped using spreadsheets. Domus pays for itself with the time I save on rent tracking alone." },
  { name: "Jordan K.", role: "Manager", body: "The maintenance tracker is a game changer. My tenants love seeing their ticket progress in real-time." },
  { name: "Sam T.", role: "Tenant", body: "As a tenant, I actually enjoy paying rent now. The gamification makes me feel good about paying on time." }
];

export const tiers = [
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

export const faqs = [
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

export const sectionKickerClass = "text-xs font-semibold uppercase tracking-[0.22em] text-violet-600";
export const sectionHeadingClass = "text-4xl font-semibold tracking-tight text-slate-900";
export const sectionCopyClass = "max-w-3xl text-base leading-7 text-slate-700";
export const surfaceClass =
  "rounded-[30px] border border-slate-200 bg-white shadow-[0_22px_60px_-42px_rgba(15,23,42,0.22)]";
export const softSurfaceClass =
  "rounded-[28px] border border-slate-200 bg-slate-50 shadow-[0_18px_46px_-38px_rgba(15,23,42,0.16)]";
