import { HomePassCard, UnleasedHomeRow } from "./home-pass-card";
import { YtdTiles } from "./ytd-tiles";
import { NeedsYouList, type NeedsYouSummary } from "./needs-you-list";
import { RecentActivity } from "./recent-activity";
import type { PortfolioData } from "@/lib/portfolio";
import type { OwnerBankCardState } from "@/lib/owner-bank-status";
import type { OwnerHomeMoneyResult } from "@/lib/owner-recent-activity";

export function WalletHome({ portfolio, summary, bankState, money, ytdIncomeCents, ytdExpensesCents,
  selectedPropertyId, llcSetup, onOpenSection, onOpenLeaseWizard, onSelectProperty,
  expensesReady = true, expensesFailed = false }: {
  portfolio: PortfolioData; summary: NeedsYouSummary; bankState: OwnerBankCardState;
  money?: OwnerHomeMoneyResult; ytdIncomeCents: number | null; ytdExpensesCents: number;
  expensesReady?: boolean; expensesFailed?: boolean;
  selectedPropertyId?: string | null;
  llcSetup?: { accountName: string; onInviteMembers: () => void } | null;
  onOpenSection: (id: string) => void; onOpenLeaseWizard?: () => void;
  onSelectProperty?: (id: string) => void;
}) {
  const homes = [...portfolio.properties].sort((a, b) => a.name.localeCompare(b.name));
  const activeLeases = portfolio.leases.filter((lease) => lease.active);
  const leased = homes.filter((home) => activeLeases.some((lease) => lease.propertyId === home.id));
  const unleased = homes.filter((home) => !activeLeases.some((lease) => lease.propertyId === home.id));
  return <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 py-1">
    {leased.length > 0 ? <div
      aria-label="Rented homes"
      className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {leased.map((home, index) => <HomePassCard key={home.id} home={home} index={index}
        single={leased.length === 1}
        leases={activeLeases.filter((lease) => lease.propertyId === home.id)}
        isLate={summary.lateCharges.some((charge) => charge.propertyId === home.id)}
        leftCents={money?.ok ? money.leftByPropertyId[home.id] ?? 0 : 0} moneyLoaded={money?.ok === true} />)}
    </div> : null}
    {unleased.length > 0 ? <div className="space-y-2" aria-label="Homes without a lease">
      {unleased.map((home) => <UnleasedHomeRow key={home.id} home={home} />)}
    </div> : null}
    <YtdTiles incomeCents={ytdIncomeCents} expensesCents={ytdExpensesCents} selectedPropertyId={selectedPropertyId}
      expensesReady={expensesReady} expensesFailed={expensesFailed} />
    <NeedsYouList summary={summary} bankState={bankState} llcSetup={llcSetup}
      onOpenSection={onOpenSection} onOpenLeaseWizard={onOpenLeaseWizard} onSelectProperty={onSelectProperty} />
    <RecentActivity money={money} />
  </div>;
}
