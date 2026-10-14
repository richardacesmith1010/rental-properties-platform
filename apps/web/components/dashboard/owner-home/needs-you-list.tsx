import { ChevronRight } from "lucide-react";
import type { ChargeRowData } from "@/components/dashboard/charge-row";
import type { InvitationListItem } from "@/lib/invitations";
import type { OwnerBankCardState } from "@/lib/owner-bank-status";

export interface NeedsYouSummary {
  lateCharges: ChargeRowData[];
  joinedWithoutLease?: InvitationListItem[];
  openRepairCount: number;
  newMessageCount: number;
}

export function NeedsYouList({ summary, bankState, llcSetup, lateName, bankNeedsCount = 0, myTasksDueCount = 0, tasksHref = "/owner/money",
  hasBankConnection = false, hasPendingBankConnection = false,
  onOpenSection, onOpenLeaseWizard, onSelectProperty }: {
  summary: NeedsYouSummary; bankState: OwnerBankCardState;
  bankNeedsCount?: number; myTasksDueCount?: number; tasksHref?: string;
  hasBankConnection?: boolean; hasPendingBankConnection?: boolean;
  llcSetup?: { accountName: string; onInviteMembers: () => void } | null;
  lateName?: string | null;
  onOpenSection: (id: string) => void; onOpenLeaseWizard?: () => void;
  onSelectProperty?: (id: string) => void;
}) {
  const late = summary.lateCharges[0];
  const invite = summary.joinedWithoutLease?.[0];
  const rows: Array<{ key: string; label: string; href?: string; run?: () => void }> = [];
  if (lateName || (lateName === undefined && late)) rows.push({ key: "late",
    label: `${lateName || late?.tenantName || "Tenant"}'s rent is late`,
    run: () => onOpenSection("charges") });
  if (bankNeedsCount > 0) rows.push({ key: "bank-items",
    label: `${bankNeedsCount} bank items to check`, href: "/owner/bank" });
  if (myTasksDueCount > 0) rows.push({ key: "tasks", label: `${myTasksDueCount} tasks due`, href: tasksHref });
  if (hasPendingBankConnection) rows.push({ key: "bank-match", label: "Finish connecting", href: "/owner/bank" });
  else if (!hasBankConnection && bankState.status !== "connected") rows.push({ key: "bank",
    label: bankState.status === "needs_info"
      ? `Finish ${bankState.accountName ? `${bankState.accountName} ` : ""}bank setup`
      : `Connect ${bankState.accountName ? `${bankState.accountName} ` : "your "}bank`, href: bankState.href });
  else if (llcSetup) rows.push({ key: "llc", label: `Finish ${llcSetup.accountName} setup`, run: llcSetup.onInviteMembers });
  if (invite) rows.push({ key: "lease", label: `${invite.fullName} joined. Set up their lease`, run: () => {
    if (invite.propertyId) onSelectProperty?.(invite.propertyId);
    onOpenLeaseWizard?.();
  } });
  if (summary.openRepairCount > 0) rows.push({ key: "repairs",
    label: `${summary.openRepairCount} open repair${summary.openRepairCount === 1 ? "" : "s"}`,
    run: () => onOpenSection("maintenance") });
  if (summary.newMessageCount > 0) rows.push({ key: "messages",
    label: `${summary.newMessageCount} new message${summary.newMessageCount === 1 ? "" : "s"}`,
    run: () => onOpenSection("inbox") });
  if (rows.length === 0) return null;
  return <section aria-labelledby="needs-you-title">
    <h2 id="needs-you-title" className="mb-3 text-lg font-bold text-[var(--ink)]">Needs you</h2>
    <div className="overflow-hidden rounded-2xl bg-[var(--warn-bg)]">
      {rows.slice(0, 3).map((row) => {
        const className = [
          "flex min-h-11 w-full items-center justify-between gap-3 border-b",
          "border-[var(--line)] px-4 py-3 text-left font-medium text-[var(--ink)] last:border-0",
        ].join(" ");
        const content = <><span>{row.label}</span><ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" /></>;
        return row.href ? <a key={row.key} href={row.href} title={row.label} className={className}>{content}</a>
          : <button key={row.key} type="button" onClick={row.run} title={row.label} className={className}>{content}</button>;
      })}
    </div>
  </section>;
}
