export type DepositLease = { deposit_cents: number };
export type DepositReturn = { returned_cents: number; returned_on: string };

export function depositHeldCents(lease: DepositLease, returnRow: DepositReturn | null): number {
  return returnRow === null ? lease.deposit_cents : 0;
}
