// Automatic late fees are paused (2026-10-24). Colorado (C.R.S. 38-12-105) requires the fee in the lease, no fee on
// a subsidy's share, one fee per late payment, and written notice within 180 days. Domus can't prove these yet.
// Turning this on needs a reviewed sprint that proves each condition (docs/compliance/rules-map.md).
export function automaticLateFeesEnabled(): boolean {
  return false;
}
