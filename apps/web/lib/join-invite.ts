export const INACTIVE_INVITE_MESSAGE = "This invite is no longer active. Ask the person who invited you for a new one.";

export interface JoinInvitation {
  role: string;
  status: string;
  created_at: string;
}

export function isJoinInviteActive(invite: JoinInvitation | null, now = new Date()): boolean {
  if (!invite || invite.status !== "pending" || !["tenant", "manager"].includes(invite.role)) return false;
  const age = now.getTime() - new Date(invite.created_at).getTime();
  return Number.isFinite(age) && age >= 0 && age < 30 * 24 * 60 * 60 * 1000;
}
