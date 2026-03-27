import { formatCurrency, formatDate } from "@/lib/format";

export interface AiContextInput {
  properties: Array<{
    name: string;
    unitCount: number;
    occupiedCount: number;
  }>;
  activeLeases: Array<{
    tenantName: string;
    rentCents: number;
    propertyName: string;
    endDate: string;
  }>;
  outstandingCharges: Array<{
    tenantName: string;
    amountCents: number;
    dueDate: string;
    status: string;
  }>;
  openTickets: Array<{
    title: string;
    status: string;
    propertyName: string;
  }>;
  recentPayments: Array<{
    tenantName: string;
    amountCents: number;
    paidAt: string;
  }>;
}

function getLongDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(value);
}

function getMonthYear(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric"
  }).format(parsed);
}

function getFirstName(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "there";
  }

  const [firstName] = trimmed.split(/\s+/);
  return firstName || "there";
}

function getDueStatusLabel(dueDate: string, now: Date) {
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) {
    return `due ${dueDate}`;
  }

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfDueDate = new Date(parsed);
  startOfDueDate.setHours(0, 0, 0, 0);

  const diffDays = Math.round((startOfDueDate.getTime() - startOfToday.getTime()) / 86_400_000);
  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
  }

  if (diffDays === 0) {
    return "due today";
  }

  return `due in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
}

export function buildAiContextSummary(input: AiContextInput, today = new Date()) {
  const sections = [
    `Properties (${input.properties.length}):`,
    input.properties.length > 0
      ? input.properties
          .map(
            (property) =>
              `- ${property.name} (${property.unitCount} units, ${property.occupiedCount} occupied)`
          )
          .join("\n")
      : "- None right now.",
    "",
    `Active Leases (${input.activeLeases.length}):`,
    input.activeLeases.length > 0
      ? input.activeLeases
          .map(
            (lease) =>
              `- ${lease.tenantName} - ${formatCurrency(lease.rentCents)}/mo - ${lease.propertyName} - ends ${getMonthYear(lease.endDate)}`
          )
          .join("\n")
      : "- None right now.",
    "",
    `Outstanding Rent (${input.outstandingCharges.length}):`,
    input.outstandingCharges.length > 0
      ? input.outstandingCharges
          .map(
            (charge) =>
              `- ${charge.tenantName} owes ${formatCurrency(charge.amountCents)} - ${getDueStatusLabel(charge.dueDate, today)}`
          )
          .join("\n")
      : "- None right now.",
    "",
    `Open Maintenance Issues (${input.openTickets.length}):`,
    input.openTickets.length > 0
      ? input.openTickets
          .map(
            (ticket) =>
              `- "${ticket.title}" (${ticket.status}) - ${ticket.propertyName}`
          )
          .join("\n")
      : "- None right now.",
    "",
    `Recent Payments (last 30 days, ${input.recentPayments.length}):`,
    input.recentPayments.length > 0
      ? input.recentPayments
          .map(
            (payment) =>
              `- ${payment.tenantName} paid ${formatCurrency(payment.amountCents)} on ${formatDate(payment.paidAt)}`
          )
          .join("\n")
      : "- None right now."
  ];

  return sections.join("\n");
}

export function buildAiSystemPrompt(params: {
  ownerFirstName?: string | null;
  contextSummary: string;
  today?: Date;
}) {
  return [
    `You are Domus Assistant, a helpful property management AI for ${getFirstName(params.ownerFirstName)}.`,
    "You help them understand their rental portfolio.",
    `Today is ${getLongDate(params.today ?? new Date())}.`,
    "",
    "Here is their current portfolio data:",
    params.contextSummary,
    "",
    "Keep answers short and direct. Use plain language - write like you're texting a friend, not writing a report.",
    "Only answer questions about the data shown above.",
    "If you don't have the data to answer something, say so clearly - never make up numbers, names, or dates.",
    "Never share sensitive financial details beyond what's in the summary above."
  ].join("\n");
}
