"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { OwnershipAccountDTO } from "@/lib/ownership";

interface AccountSwitcherProps {
  accounts: OwnershipAccountDTO[];
  activeAccountId: string;
}

function getAccountTypeLabel(accountType: OwnershipAccountDTO["accountType"]) {
  return accountType === "llc" ? "LLC" : "Individual";
}

export function AccountSwitcher({ accounts, activeAccountId }: AccountSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeAccount = accounts.find((account) => account.id === activeAccountId) ?? accounts[0];

  if (!activeAccount) {
    return null;
  }

  const handleAccountChange = (nextAccountId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("account", nextAccountId);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const handleCreateAccount = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", "records");
    params.set("section", "ownership");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  if (accounts.length <= 1) {
    return (
      <div className="rounded-[10px] border border-white/15 bg-white/10 px-3 py-3 text-white">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-white/80" />
          <p className="truncate text-sm font-semibold">{activeAccount.displayName}</p>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="outline" className="border-white/20 bg-white/10 text-white">
            {getAccountTypeLabel(activeAccount.accountType)}
          </Badge>
          <span className="text-xs text-white/65">
            {activeAccount.memberCount} member{activeAccount.memberCount === 1 ? "" : "s"}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCreateAccount}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/60 transition hover:bg-white/10 hover:text-white/80"
          title="Create a new ownership account."
        >
          <Plus className="h-3 w-3" />
          New Account
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-white/15 bg-white/10 px-3 py-3 text-white">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-white/80" />
          <p className="truncate text-sm font-semibold">{activeAccount.displayName}</p>
        </div>
        <Badge variant="outline" className="border-white/20 bg-white/10 text-white">
          {getAccountTypeLabel(activeAccount.accountType)}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-white/65">
        {activeAccount.memberCount} member{activeAccount.memberCount === 1 ? "" : "s"}
      </p>
      <select
        value={activeAccount.id}
        onChange={(event) => handleAccountChange(event.target.value)}
        className="mt-3 w-full rounded-[10px] border border-white/15 bg-white/10 px-3 py-2 text-sm text-white transition focus:outline-none focus:ring-2 focus:ring-white/70"
        title="Switch ownership account."
        aria-label="Switch ownership account"
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id} className="text-zinc-900">
            {account.displayName} - {getAccountTypeLabel(account.accountType)} - {account.memberCount} member
            {account.memberCount === 1 ? "" : "s"}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleCreateAccount}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/60 transition hover:bg-white/10 hover:text-white/80"
        title="Create a new ownership account."
      >
        <Plus className="h-3 w-3" />
        New Account
      </button>
    </div>
  );
}
