import { daysBetween, todayDenver } from "@/lib/denver-calendar";
import { tracksLateRent, type LeaseCollectionPreference } from "@/lib/lease-collection";

export type ChargeUrgencyLevel = "none" | "upcoming" | "due_today" | "overdue";

export interface ChargeUrgencyInput extends LeaseCollectionPreference {
  status: string;
  dueDate: string;
}

export interface ChargeUrgencyResult {
  level: ChargeUrgencyLevel;
  daysUntilDue: number;
}

export function isRentOpenForTenant(dueDate: string, today: Date | string = todayDenver()): boolean {
  return daysBetween(typeof today === "string" ? today : todayDenver(today), dueDate) <= 5;
}

export function getChargeUrgency(
  charge: ChargeUrgencyInput,
  now: Date | string = todayDenver()
): ChargeUrgencyResult {
  if (charge.status === "paid") {
    return { level: "none", daysUntilDue: 0 };
  }

  const daysUntilDue = daysBetween(typeof now === "string" ? now : todayDenver(now), charge.dueDate);

  if (daysUntilDue > 5) {
    return { level: "none", daysUntilDue };
  }

  if (daysUntilDue > 0) {
    return { level: "upcoming", daysUntilDue };
  }

  if (daysUntilDue === 0) {
    return { level: "due_today", daysUntilDue };
  }

  if (!tracksLateRent(charge)) {
    return { level: "none", daysUntilDue };
  }

  return { level: "overdue", daysUntilDue };
}

function urgencyPriority(level: ChargeUrgencyLevel) {
  switch (level) {
    case "overdue":
      return 3;
    case "due_today":
      return 2;
    case "upcoming":
      return 1;
    case "none":
    default:
      return 0;
  }
}

export function getMostUrgentCharge<T extends ChargeUrgencyInput>(
  charges: T[],
  now: Date | string = todayDenver()
): { charge: T; urgency: ChargeUrgencyResult } | null {
  let selected: { charge: T; urgency: ChargeUrgencyResult } | null = null;

  for (const charge of charges) {
    const urgency = getChargeUrgency(charge, now);
    if (urgency.level === "none") {
      continue;
    }

    if (!selected) {
      selected = { charge, urgency };
      continue;
    }

    const currentPriority = urgencyPriority(urgency.level);
    const selectedPriority = urgencyPriority(selected.urgency.level);

    if (currentPriority > selectedPriority) {
      selected = { charge, urgency };
      continue;
    }

    if (currentPriority < selectedPriority) {
      continue;
    }

    if (urgency.daysUntilDue < selected.urgency.daysUntilDue) {
      selected = { charge, urgency };
    }
  }

  return selected;
}
