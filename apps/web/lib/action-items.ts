import type { DashboardCharge } from "@/lib/dashboard";
import type { MaintenanceTicket } from "@/lib/maintenance";
import type { ManagerPaymentDTO } from "@/lib/manager-payments";
import type { LeaseListItem } from "@/lib/portfolio";
import type { LLCInvitationDTO } from "@/lib/llc-invitations";

export type ActionItemSeverity = "urgent" | "attention" | "info";
export type ActionItemKind =
  | "overdue_charge"
  | "due_soon_charge"
  | "manager_payment"
  | "maintenance"
  | "pending_members"
  | "feedback"
  | "lease_expiring";

export interface ActionItem {
  id: string;
  kind: ActionItemKind;
  severity: ActionItemSeverity;
  title: string;
  description: string;
  linkTo: "charges" | "manager-payments" | "maintenance" | "members" | "leases" | "feedback";
  chargeId?: string;
  managerPaymentId?: string;
  sortDate?: string;
}

interface ActionItemInput {
  charges: DashboardCharge[];
  tickets: MaintenanceTicket[];
  managerPayments: ManagerPaymentDTO[];
  leases: LeaseListItem[];
  pendingInvitations: LLCInvitationDTO[];
  newFeedbackCount: number;
  today?: Date;
}

const severityRank: Record<ActionItemSeverity, number> = {
  urgent: 0,
  attention: 1,
  info: 2
};

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function diffUtcDays(target: Date, base: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((startOfUtcDay(target).getTime() - startOfUtcDay(base).getTime()) / msPerDay);
}

function possessive(name: string) {
  const trimmed = name.trim() || "Tenant";
  return trimmed.endsWith("s") ? `${trimmed}'` : `${trimmed}'s`;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatDaysUntil(days: number, suffix = "day") {
  if (days <= 0) {
    return "today";
  }

  if (days === 1) {
    return `in 1 ${suffix}`;
  }

  return `in ${days} ${suffix}s`;
}

function getNextDueDateForLease(lease: LeaseListItem, today: Date) {
  if (!lease.active) {
    return null;
  }

  const leaseStart = parseDateOnly(lease.startDate);
  const leaseEnd = parseDateOnly(lease.endDate);
  const monthCandidates = [0, 1].map((offset) => {
    const year = today.getUTCFullYear() + Math.floor((today.getUTCMonth() + offset) / 12);
    const month = (today.getUTCMonth() + offset) % 12;
    const day = Math.max(1, Math.min(28, lease.dueDayOfMonth));
    return new Date(Date.UTC(year, month, day));
  });

  for (const candidate of monthCandidates) {
    if (candidate < leaseStart || candidate > leaseEnd) {
      continue;
    }
    if (candidate >= startOfUtcDay(today)) {
      return candidate;
    }
  }

  return null;
}

export function getNextRentCollectionLabel(
  params: Pick<ActionItemInput, "charges" | "leases"> & { today?: Date }
) {
  const today = params.today ? startOfUtcDay(params.today) : startOfUtcDay(new Date());
  const nextPendingCharge = params.charges
    .filter((charge) => charge.category === "rent" && charge.status === "pending")
    .map((charge) => ({
      charge,
      dueDate: parseDateOnly(charge.dueDate)
    }))
    .filter((entry) => entry.dueDate >= today)
    .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime())[0];

  if (nextPendingCharge) {
    const daysUntil = diffUtcDays(nextPendingCharge.dueDate, today);
    return daysUntil === 0
      ? "Your next rent collection is due today."
      : `Your next rent collection is ${formatDaysUntil(daysUntil)}.`;
  }

  const nextLeaseDueDate = params.leases
    .map((lease) => getNextDueDateForLease(lease, today))
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => left.getTime() - right.getTime())[0];

  if (!nextLeaseDueDate) {
    return null;
  }

  const daysUntil = diffUtcDays(nextLeaseDueDate, today);
  return daysUntil === 0
    ? "Your next rent collection is due today."
    : `Your next rent collection is ${formatDaysUntil(daysUntil)}.`;
}

export function computeActionItems({
  charges,
  tickets,
  managerPayments,
  leases,
  pendingInvitations,
  newFeedbackCount,
  today = new Date()
}: ActionItemInput): ActionItem[] {
  const items: ActionItem[] = [];
  const todayStart = startOfUtcDay(today);

  for (const charge of charges) {
    if (charge.category !== "rent") {
      continue;
    }

    const dueDate = parseDateOnly(charge.dueDate);
    const daysUntilDue = diffUtcDays(dueDate, todayStart);

    if (charge.status === "late") {
      items.push({
        id: `charge-overdue-${charge.id}`,
        kind: "overdue_charge",
        severity: "urgent",
        title: `${possessive(charge.tenantName)} rent is overdue`,
        description: `${new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD"
        }).format(charge.amountCents / 100)} was due ${charge.dueDate}`,
        chargeId: charge.id,
        linkTo: "charges",
        sortDate: charge.dueDate
      });
      continue;
    }

    if (charge.status === "pending" && daysUntilDue >= 0 && daysUntilDue <= 3) {
      items.push({
        id: `charge-due-soon-${charge.id}`,
        kind: "due_soon_charge",
        severity: daysUntilDue <= 1 ? "urgent" : "attention",
        title:
          daysUntilDue === 0
            ? `${possessive(charge.tenantName)} rent is due today`
            : `${possessive(charge.tenantName)} rent is due ${formatDaysUntil(daysUntilDue)}`,
        description: `${new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD"
        }).format(charge.amountCents / 100)} due ${charge.dueDate}`,
        chargeId: charge.id,
        linkTo: "charges",
        sortDate: charge.dueDate
      });
    }
  }

  const pendingManagerPayments = managerPayments
    .filter((payment) => payment.status === "pending")
    .sort((left, right) => left.paymentDate.localeCompare(right.paymentDate));
  if (pendingManagerPayments.length === 1) {
    const payment = pendingManagerPayments[0];
    const dueDate = parseDateOnly(payment.paymentDate);
    const daysUntilDue = diffUtcDays(dueDate, todayStart);
    items.push({
      id: `manager-payment-${payment.id}`,
      kind: "manager_payment",
      severity: daysUntilDue <= 0 ? "urgent" : "attention",
      title: `${possessive(payment.managerName)} manager payment is due`,
      description: `${new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD"
      }).format(payment.amountCents / 100)} due ${payment.paymentDate}`,
      managerPaymentId: payment.id,
      linkTo: "manager-payments",
      sortDate: payment.paymentDate
    });
  } else if (pendingManagerPayments.length > 1) {
    items.push({
      id: "manager-payments-pending",
      kind: "manager_payment",
      severity: "attention",
      title: `${pluralize(pendingManagerPayments.length, "manager payment")} need review`,
      description: `The next payment is due ${pendingManagerPayments[0]?.paymentDate}.`,
      managerPaymentId: pendingManagerPayments[0]?.id,
      linkTo: "manager-payments",
      sortDate: pendingManagerPayments[0]?.paymentDate
    });
  }

  const urgentTickets = tickets.filter(
    (ticket) =>
      (ticket.status === "open" || ticket.status === "in_progress") &&
      (ticket.priority === "high" || ticket.priority === "urgent")
  );
  if (urgentTickets.length > 0) {
    const firstTicket = urgentTickets
      .slice()
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
    items.push({
      id: "maintenance-urgent",
      kind: "maintenance",
      severity: "urgent",
      title:
        urgentTickets.length === 1
          ? `${firstTicket.title} needs attention`
          : `${pluralize(urgentTickets.length, "urgent maintenance ticket")} are open`,
      description:
        urgentTickets.length === 1
          ? `${firstTicket.propertyName}${firstTicket.unitNumber ? ` • ${firstTicket.unitNumber}` : ""}`
          : "Review the open urgent tickets and dispatch the next step.",
      linkTo: "maintenance",
      sortDate: firstTicket.createdAt
    });
  }

  if (pendingInvitations.length > 0) {
    items.push({
      id: "members-pending",
      kind: "pending_members",
      severity: "info",
      title: `${pluralize(pendingInvitations.length, "pending member invitation")} awaiting acceptance`,
      description: "Review LLC invites, resend stalled emails, or cancel the extras.",
      linkTo: "members",
      sortDate: pendingInvitations[0]?.createdAt
    });
  }

  if (newFeedbackCount > 0) {
    items.push({
      id: "feedback-new",
      kind: "feedback",
      severity: "info",
      title: `${pluralize(newFeedbackCount, "new feedback message")} waiting`,
      description: "Review fresh bug reports and feature requests from the ops inbox.",
      linkTo: "feedback"
    });
  }

  const expiringLeases = leases
    .filter((lease) => lease.active)
    .map((lease) => ({
      lease,
      daysUntilEnd: diffUtcDays(parseDateOnly(lease.endDate), todayStart)
    }))
    .filter((entry) => entry.daysUntilEnd >= 0 && entry.daysUntilEnd <= 30)
    .sort((left, right) => left.daysUntilEnd - right.daysUntilEnd);
  if (expiringLeases.length === 1) {
    const entry = expiringLeases[0];
    items.push({
      id: `lease-expiring-${entry.lease.id}`,
      kind: "lease_expiring",
      severity: entry.daysUntilEnd <= 7 ? "urgent" : "attention",
      title: `${possessive(entry.lease.tenantName)} lease expires soon`,
      description:
        entry.daysUntilEnd === 0
          ? `Ends today on ${entry.lease.endDate}.`
          : `Ends ${formatDaysUntil(entry.daysUntilEnd)} on ${entry.lease.endDate}.`,
      linkTo: "leases",
      sortDate: entry.lease.endDate
    });
  } else if (expiringLeases.length > 1) {
    items.push({
      id: "leases-expiring",
      kind: "lease_expiring",
      severity: expiringLeases[0]?.daysUntilEnd <= 7 ? "urgent" : "attention",
      title: `${pluralize(expiringLeases.length, "lease")} expire within 30 days`,
      description: `The next lease ends ${formatDaysUntil(expiringLeases[0]?.daysUntilEnd ?? 0)}.`,
      linkTo: "leases",
      sortDate: expiringLeases[0]?.lease.endDate
    });
  }

  return items.sort((left, right) => {
    const severityDiff = severityRank[left.severity] - severityRank[right.severity];
    if (severityDiff !== 0) {
      return severityDiff;
    }

    if (left.sortDate && right.sortDate) {
      return left.sortDate.localeCompare(right.sortDate);
    }

    if (left.sortDate) {
      return -1;
    }

    if (right.sortDate) {
      return 1;
    }

    return left.title.localeCompare(right.title);
  });
}
