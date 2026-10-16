// Exclude reversed payments in the Supabase query with `.is("reversed_at", null)`.
// Apply that filter before sorting or limiting money and receipt reads.
// Keep reversed rows only for history views, and label them there.
export function isActivePayment(payment: { reversedAt: string | null }): boolean {
  return payment.reversedAt === null;
}
