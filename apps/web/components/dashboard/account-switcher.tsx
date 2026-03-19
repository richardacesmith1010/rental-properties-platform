"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, Check, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import type { AccountRenameRequestDTO, OwnershipAccountDTO } from "@/lib/ownership";
import type { StatefulAction } from "./types";

interface AccountSwitcherProps {
  accounts: OwnershipAccountDTO[];
  activeAccountId: string;
  onRenameOwnershipAccount?: StatefulAction;
  pendingRenameRequests?: AccountRenameRequestDTO[];
}

export function AccountSwitcher({
  accounts,
  activeAccountId,
  onRenameOwnershipAccount,
  pendingRenameRequests
}: AccountSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeAccount = accounts.find((account) => account.id === activeAccountId) ?? accounts[0] ?? null;
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const saveTriggeredRef = useRef(false);

  const activePendingRenameRequest =
    pendingRenameRequests?.find((request) => request.ownershipAccountId === activeAccount?.id) ?? null;
  const canRename = Boolean(onRenameOwnershipAccount) && !activePendingRenameRequest;
  const renameTitle = activePendingRenameRequest
    ? "A rename request is already pending for this account."
    : `Rename ${activeAccount?.displayName ?? "this account"}.`;

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

  const cancelEdit = () => {
    if (!activeAccount) {
      return;
    }
    saveTriggeredRef.current = false;
    setEditName(activeAccount.displayName);
    setIsEditing(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const saveEdit = () => {
    if (!activeAccount || !onRenameOwnershipAccount || saveTriggeredRef.current) {
      return;
    }

    const nextName = editName.trim();
    if (!nextName || nextName === activeAccount.displayName) {
      cancelEdit();
      return;
    }

    saveTriggeredRef.current = true;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("accountId", activeAccount.id);
      formData.set("newName", nextName);

      const result = await onRenameOwnershipAccount(null, formData);
      saveTriggeredRef.current = false;

      if (!result?.success) {
        toast.error(result?.error ?? "Unable to rename this account right now.");
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      if (result.message === "Rename request submitted for member approval.") {
        toast.success("Rename request submitted for member vote.");
      } else {
        toast.success(result.message ?? "Account renamed.");
      }

      setIsEditing(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
      router.refresh();
    });
  };

  const startEdit = () => {
    if (!activeAccount) {
      return;
    }
    if (!canRename || isPending) {
      return;
    }
    setEditName(activeAccount.displayName);
    setIsEditing(true);
  };

  useEffect(() => {
    if (!isEditing) {
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  useEffect(() => {
    saveTriggeredRef.current = false;
    setEditName(activeAccount?.displayName ?? "");
    setIsEditing(false);
  }, [activeAccount?.displayName, activeAccount?.id]);

  if (!activeAccount) {
    return null;
  }

  const nameRow = isEditing ? (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input
        ref={inputRef}
        value={editName}
        onChange={(event) => setEditName(event.target.value)}
        onBlur={() => {
          if (!saveTriggeredRef.current) {
            saveEdit();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            saveEdit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancelEdit();
          }
        }}
        disabled={isPending}
        className="h-8 min-w-0 flex-1 rounded-[10px] border border-white/15 bg-white/5 px-2.5 text-sm font-semibold text-white outline-none transition placeholder:text-white/35 focus:border-white/35 focus:bg-white/10"
        aria-label="Rename account"
        title={renameTitle}
      />
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={saveEdit}
        disabled={isPending}
        className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/15 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        title="Save this account name."
      >
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </button>
    </div>
  ) : (
    <button
      ref={triggerRef}
      type="button"
      onClick={startEdit}
      disabled={!canRename || isPending}
      className="group flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
      title={renameTitle}
      aria-label={renameTitle}
    >
      <span className="block min-w-0 flex-1 truncate text-sm font-semibold text-white">
        {activeAccount.displayName}
      </span>
      {onRenameOwnershipAccount ? (
        <Pencil className="h-3.5 w-3.5 shrink-0 text-white/60 opacity-70 transition group-hover:text-white/95 group-hover:opacity-100" />
      ) : null}
    </button>
  );

  if (accounts.length <= 1) {
    return (
      <div className="rounded-[10px] border border-white/15 bg-white/10 px-3.5 py-3.5 text-white shadow-sm">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-white/80" />
          {nameRow}
        </div>
        {activePendingRenameRequest ? (
          <p className="mt-2 text-xs text-amber-200/90">
            Rename pending • {activePendingRenameRequest.votesReceived}/{activePendingRenameRequest.votesRequired} votes
          </p>
        ) : null}
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
    <div className="rounded-[10px] border border-white/15 bg-white/10 px-3.5 py-3.5 text-white shadow-sm">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-white/80" />
        {nameRow}
      </div>
      {activePendingRenameRequest ? (
        <p className="mt-2 text-xs text-amber-200/90">
          Rename pending • {activePendingRenameRequest.votesReceived}/{activePendingRenameRequest.votesRequired} votes
        </p>
      ) : null}
      <select
        value={activeAccount.id}
        onChange={(event) => handleAccountChange(event.target.value)}
        className="mt-3 w-full rounded-[10px] border border-white/15 bg-white/10 px-3 py-2 text-sm text-white transition focus:outline-none focus:ring-2 focus:ring-white/70"
        title="Switch ownership account."
        aria-label="Switch ownership account"
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id} className="text-zinc-900">
            {account.displayName}
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
