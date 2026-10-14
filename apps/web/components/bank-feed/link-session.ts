"use client";

import type { ComponentProps } from "react";
import type { BankConnectionsCard } from "./bank-connections-card";
import type { PlaidSuccessMetadata } from "./plaid-script";

export type LinkSession = { linkToken: string; mode: "create" | "relink"; ownerAccountId?: string;
  connectionId?: string; startedAt: number; expiresAt: number };
export type FinishActions = Pick<ComponentProps<typeof BankConnectionsCard>["actions"], "finish" | "finishRelink">;
const key = "domus.plaidLink";
const lifetime = 30 * 60 * 1000;

export function clearLinkSession(): void {
  try { localStorage.removeItem(key); } catch { /* Storage unavailable means no resumable session. */ }
}

export function saveLinkSession(input: Omit<LinkSession, "expiresAt">): boolean {
  try {
    const value = JSON.stringify({ ...input, expiresAt: input.startedAt + lifetime });
    localStorage.setItem(key, value);
    if (localStorage.getItem(key) === value) return true;
  } catch { /* Fail closed: never open Link without a readable saved token. */ }
  clearLinkSession();
  return false;
}

export function loadLinkSession(now: number): LinkSession | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const session = JSON.parse(raw) as LinkSession | null;
    const hasText = (value: unknown) => typeof value === "string" && value.trim().length > 0;
    if (session && hasText(session.linkToken) && Number.isFinite(now)
      && Number.isFinite(session.startedAt) && Number.isFinite(session.expiresAt)
      && session.expiresAt === session.startedAt + lifetime && session.startedAt <= now + 60_000
      && now < session.expiresAt && ((session.mode === "create" && hasText(session.ownerAccountId))
        || (session.mode === "relink" && hasText(session.connectionId)))) return session;
  } catch { /* Malformed or inaccessible storage is never a usable session. */ }
  clearLinkSession();
  return null;
}

export function finishLinkSession(session: Omit<LinkSession, "expiresAt">, publicToken: string,
  metadata: PlaidSuccessMetadata, actions: FinishActions) {
  return session.mode === "relink" ? actions.finishRelink({ connectionId: session.connectionId! })
    : actions.finish({ ownerAccountId: session.ownerAccountId!, publicToken,
      selectedAccountIds: (metadata.accounts || []).flatMap((account) => account.id ? [account.id] : []) });
}
