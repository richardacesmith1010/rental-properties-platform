import Link from "next/link";
import { AlertTriangle, Clock3 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/format";
import { getMostUrgentCharge } from "@/lib/rent-urgency";
import { getStatusClasses } from "@/lib/status-colors";
import type { TenantCharge } from "@/lib/tenant-payments";

interface RentUrgencyBannerProps {
  charges: TenantCharge[];
  payHref: string;
}

export function RentUrgencyBanner({ charges, payHref }: RentUrgencyBannerProps) {
  const urgentCharge = getMostUrgentCharge(charges);

  if (!urgentCharge) {
    return null;
  }

  const { charge, urgency } = urgentCharge;
  const isOverdue = urgency.level === "overdue";
  const styles = getStatusClasses(isOverdue ? "overdue" : "upcoming");
  const Icon = isOverdue ? AlertTriangle : Clock3;
  const propertyLabel = charge.propertyLabel || `${charge.propertyName} • ${charge.unitNumber}`;
  const amount = formatCurrency(charge.amountCents);

  const heading = (() => {
    if (urgency.level === "overdue") {
      return `Rent is overdue by ${Math.abs(urgency.daysUntilDue)} day${Math.abs(urgency.daysUntilDue) === 1 ? "" : "s"}`;
    }
    if (urgency.level === "due_today") {
      return "Rent is due today";
    }
    return `Rent due in ${urgency.daysUntilDue} day${urgency.daysUntilDue === 1 ? "" : "s"}`;
  })();

  const message = (() => {
    if (urgency.level === "overdue") {
      return `${amount} for ${propertyLabel} is past due. Please pay as soon as possible.`;
    }
    if (urgency.level === "due_today") {
      return `${amount} for ${propertyLabel} is due today.`;
    }
    return `${amount} for ${propertyLabel} is coming up soon.`;
  })();

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 shadow-sm",
        styles.bg,
        styles.border
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn("rounded-full p-2", styles.bg)}>
            <Icon className={cn("h-5 w-5", styles.text)} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className={cn("text-sm font-semibold", styles.text)}>{heading}</p>
            <p className="mt-1 text-sm text-foreground">{message}</p>
          </div>
        </div>
        <Link
          href={payHref}
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-background/90"
          title="Open your rent charges and payment options."
        >
          Pay Now
        </Link>
      </div>
    </div>
  );
}
