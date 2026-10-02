import { BarChart3, Building2, CreditCard, FileText, Users, Wrench, type LucideIcon } from "lucide-react";

export interface MarketingCard { icon?: LucideIcon; title: string; body: string; }

export const problemCards: MarketingCard[] = [
  { title: "You chase rent by text", body: "Domus tells you who paid. It reminds tenants for you." },
  { title: "Repairs slip through", body: "Tenants report problems in the app. You see each one until it's fixed." },
  { title: "Papers are everywhere", body: "Leases and receipts live in one safe spot." }
];

export const featureCards: MarketingCard[] = [
  { icon: CreditCard, title: "Collect rent online", body: "Tenants pay by bank or card. Autopay is one tap. Money goes to your bank." },
  { icon: Wrench, title: "Fix problems fast", body: "Tenants send a problem with photos. Everyone sees where it stands." },
  { icon: FileText, title: "Leases and papers", body: "Make a lease, sign it, and keep every receipt." },
  { icon: BarChart3, title: "Clear reports", body: "See money in, money out, and who is late. Ready for tax time." },
  { icon: Users, title: "Bring a manager", body: "Give a manager only the homes they run. You keep the money view." },
  { icon: Building2, title: "Own with family", body: "Share homes held in an LLC (a type of business) with co-owners." }
];

export const steps = [
  { title: "Sign up", body: "It takes about two minutes." },
  { title: "Add your homes", body: "Type the address and units. Set the rent." },
  { title: "Invite tenants", body: "Enter their email. They get a link to join." },
  { title: "Get paid", body: "Tenants pay online. The money goes to your bank." }
];

export const faqs = [
  { q: "Is Domus really free?", a: "Yes, while we are in early access. You don't need a credit card to start." },
  { q: "How do tenants pay?", a: "Online, by bank or card, through Stripe. They can turn on autopay." },
  { q: "Is my data safe?", a: "Each person only sees what they should. Connections are encrypted. Changes are logged." },
  { q: "What if a tenant pays late?", a: "Domus sends reminders. You see what is overdue and for how long." },
  { q: "Can my property manager use it?", a: "Yes. Managers get their own view of just the homes they run." }
];
