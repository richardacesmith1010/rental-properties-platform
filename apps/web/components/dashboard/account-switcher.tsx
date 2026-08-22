"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, Check, ChevronDown, Loader2, Pencil, Plus } from "lucide-react";
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
  const menuId = useId();
  const activeAccount = accounts.find((account) => account.id === activeAccountId) ?? accounts[0] ?? null;
  const [isEditing, setIsEditing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const renameTriggerRef = useRef<HTMLButtonElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const saveTriggeredRef = useRef(false);

  const activePendingRenameRequest =
    pendingRenameRequests?.find((request) => request.ownershipAccountId === activeAccount?.id) ?? null;
  const canRename = Boolean(onRenameOwnershipAccount) && !activePendingRenameRequest;
  const renameTitle = activePendingRenameRequest
    ? "A rename request is already pending for this account."
    : `Rename ${activeAccount?.displayName ?? "this account"}.`;

  const handleAccountChange = (nextAccountId: string) => {
    setIsMenuOpen(false);
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
    window.requestAnimationFrame(() => renameTriggerRef.current?.focus());
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
      window.requestAnimationFrame(() => renameTriggerRef.current?.focus());
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
    setIsMenuOpen(false);
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
    setIsMenuOpen(false);
  }, [activeAccount?.displayName, activeAccount?.id]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (menuTriggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }

      setIsMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setIsMenuOpen(false);
      window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

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
        className="sidebar-shell-input h-8 min-w-0 flex-1 px-2.5 text-sm font-semibold"
        aria-label="Rename account"
        title={renameTitle}
      />
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={saveEdit}
        disabled={isPending}
        className="sidebar-shell-button flex h-8 w-8 items-center justify-center disabled:cursor-not-allowed disabled:opacity-60"
        title="Save this account name."
      >
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </button>
    </div>
  ) : (
    <button
      ref={renameTriggerRef}
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
        <Pencil className="h-3.5 w-3.5 shrink-0 text-white/80 opacity-80 transition group-hover:text-white group-hover:opacity-100" />
      ) : null}
    </button>
  );

  if (accounts.length <= 1) {
    return (
      <div className="sidebar-shell-panel px-3.5 py-3.5 text-white shadow-sm">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-white/90" />
          {nameRow}
        </div>
        {activePendingRenameRequest ? (
          <p className="mt-2 text-xs text-amber-100">
            Rename pending • {activePendingRenameRequest.votesReceived}/{activePendingRenameRequest.votesRequired} votes
          </p>
        ) : null}
        <button
          type="button"
          onClick={handleCreateAccount}
          className="sidebar-shell-button mt-3 flex w-full items-center justify-center gap-1.5 px-3 py-2 text-xs"
          title="Create a new ownership account."
        >
          <Plus className="h-3 w-3" />
          New Account
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar-shell-panel px-3.5 py-3.5 text-white shadow-sm">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-white/90" />
        {nameRow}
      </div>
      {activePendingRenameRequest ? (
        <p className="mt-2 text-xs text-amber-100">
          Rename pending • {activePendingRenameRequest.votesReceived}/{activePendingRenameRequest.votesRequired} votes
        </p>
      ) : null}
      <div className="relative z-10 mt-3">
        <button
          ref={menuTriggerRef}
          type="button"
          onClick={() => setIsMenuOpen((current) => !current)}
          className="sidebar-shell-input flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
          title="Switch ownership account."
          aria-label="Switch ownership account"
          aria-haspopup="listbox"
          aria-expanded={isMenuOpen}
          aria-controls={menuId}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
              Switch account
            </span>
            <span className="block truncate text-sm font-semibold text-white">
              {activeAccount.displayName}
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-white/80 transition-transform ${isMenuOpen ? "rotate-180" : ""}`}
          />
        </button>

        {isMenuOpen ? (
          <div
            id={menuId}
            ref={menuRef}
            role="listbox"
            aria-label="Available ownership accounts"
            className="z-[60] mt-3 overflow-hidden rounded-[12px] border border-white/18 bg-slate-950/95 p-1 shadow-[0_20px_44px_-24px_rgba(15,23,42,0.7)] backdrop-blur sm:absolute sm:left-0 sm:right-0 sm:mt-2"
          >
            {accounts.map((account) => {
              const isActive = account.id === activeAccount.id;
              return (
                <button
                  key={account.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleAccountChange(account.id)}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-left text-sm transition sm:min-h-0 ${
                    isActive
                      ? "bg-[var(--surface-3)] text-[var(--ink)]"
                      : "text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                  }`}
                  title={`Switch to ${account.displayName}.`}
                >
                  <span className="truncate font-medium">{account.displayName}</span>
                  {isActive ? <Check className="h-4 w-4 shrink-0" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={handleCreateAccount}
        className="sidebar-shell-button mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 px-3 py-2 text-xs"
        title="Create a new ownership account."
      >
        <Plus className="h-3 w-3" />
        New Account
      </button>
    </div>
  );
}
