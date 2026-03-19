export type ChargeUrgencyLevel = "none" | "upcoming" | "due_today" | "overdue";

export interface ChargeUrgencyInput {
  status: string;
  dueDate: string;
}

export interface ChargeUrgencyResult {
  level: ChargeUrgencyLevel;
  daysUntilDue: number;
}

function startOfUtcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function dueDateStart(dueDate: string) {
  const parsed = new Date(`${dueDate}T00:00:00.000Z`);
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

export function getChargeUrgency(
  charge: ChargeUrgencyInput,
  now: Date = new Date()
): ChargeUrgencyResult {
  if (charge.status === "paid") {
    return { level: "none", daysUntilDue: 0 };
  }

  const daysUntilDue = Math.round((dueDateStart(charge.dueDate) - startOfUtcDay(now)) / 86400000);

  if (daysUntilDue > 5) {
    return { level: "none", daysUntilDue };
  }

  if (daysUntilDue > 0) {
    return { level: "upcoming", daysUntilDue };
  }

  if (daysUntilDue === 0) {
    return { level: "due_today", daysUntilDue };
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
  now: Date = new Date()
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
