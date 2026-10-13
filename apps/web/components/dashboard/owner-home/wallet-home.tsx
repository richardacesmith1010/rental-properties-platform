import { HomePassCard, UnleasedHomeRow } from "./home-pass-card";
import { YtdTiles } from "./ytd-tiles";
import { NeedsYouList, type NeedsYouSummary } from "./needs-you-list";
import { RecentActivity } from "./recent-activity";
import type { OwnerBankCardState } from "@/lib/owner-bank-status";
import type { OwnerWalletHomeResult } from "@/lib/owner-wallet-home";

export function WalletHome({ wallet, summary, bankState, showAccountName, llcSetup,
  onOpenSection, onOpenLeaseWizard, onSelectProperty }: {
  wallet?: OwnerWalletHomeResult; summary: NeedsYouSummary; bankState: OwnerBankCardState; showAccountName?: boolean;
  llcSetup?: { accountName: string; onInviteMembers: () => void } | null;
  onOpenSection: (id: string) => void; onOpenLeaseWizard?: () => void;
  onSelectProperty?: (id: string) => void;
}) {
  const homes = wallet?.ok ? [...wallet.homes].sort((a, b) => a.name.localeCompare(b.name)) : [];
  const leased = homes.filter((home) => home.activeLeases.length > 0);
  const unleased = homes.filter((home) => home.activeLeases.length === 0);
  const showAccount = showAccountName ?? new Set(homes.map((home) => home.accountId)).size > 1;
  const lateHome = homes.find((home) => home.isLate);
  const lateName = lateHome?.activeLeases.flatMap((lease) => lease.tenantNames)[0] || lateHome?.name;
  const money = wallet?.ok ? { ok: true as const, leftByPropertyId: {}, items: wallet.recent } : undefined;
  return <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 py-1">
    {!wallet?.ok ? <p className="text-sm text-[var(--muted)]">Couldn&apos;t load your homes. Pull down to try again.</p> : null}
    {leased.length > 0 ? <div
      aria-label="Rented homes"
      className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {leased.map((home, index) => <HomePassCard key={home.id} home={home} index={index}
        single={leased.length === 1} showAccount={showAccount} />)}
    </div> : null}
    {unleased.length > 0 ? <div className="space-y-2" aria-label="Homes without a lease">
      {unleased.map((home) => <UnleasedHomeRow key={home.id} home={home} showAccount={showAccount} />)}
    </div> : null}
    <YtdTiles incomeCents={wallet?.ok ? wallet.ytd.inCents : null}
      expensesCents={wallet?.ok ? wallet.ytd.outCents : 0} expensesFailed={!wallet?.ok} />
    <NeedsYouList summary={summary} bankState={bankState} llcSetup={llcSetup}
      bankNeedsCount={wallet?.ok ? wallet.bankNeedsCount || 0 : 0}
      hasBankConnection={wallet?.ok ? wallet.hasBankConnection || false : false}
      hasPendingBankConnection={wallet?.ok ? wallet.hasPendingBankConnection || false : false}
      lateName={lateName ?? null} onOpenSection={onOpenSection} onOpenLeaseWizard={onOpenLeaseWizard}
      onSelectProperty={onSelectProperty} />
    <RecentActivity money={money} />
  </div>;
}
