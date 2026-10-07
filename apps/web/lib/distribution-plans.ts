export type DistributionMode = "retain" | "split_equal" | "split_custom";

export type DistributionStatus = "completed" | "failed" | "pending";

export interface DistributionHistoryEntry {
  id: string;
  paymentId: string;
  memberProfileId: string;
  memberName: string;
  memberEmail: string;
  amountCents: number;
  distributionPct: number | null;
  stripeTransferId: string | null;
  status: DistributionStatus;
  createdAt: string;
}

export interface DistributionMemberConfig {
  profileId: string;
  pct: number | null;
}

export interface DistributionConfigSnapshot {
  mode: DistributionMode;
  members: DistributionMemberConfig[];
}

export interface DistributionMemberRow {
  profileId: string;
  distributionPct: number | null;
  payoutStripeAccountId: string | null;
}

export interface PlannedDistributionShare {
  profileId: string;
  amountCents: number;
  distributionPct: number | null;
  destination: string;
}

export interface FinancialActivityEvent {
  id: string;
  type: "distribution" | "config_change" | "withdrawal" | "expense";
  title: string;
  description: string;
  amountCents: number | null;
  status: string | null;
  createdAt: string;
}

export function roundPct(value: number) {
  return Math.round(value * 100) / 100;
}

export function planEqualDistributionTransfers(
  ownerAmount: number,
  members: DistributionMemberRow[]
) {
  if (members.length === 0) {
    return { memberShares: [] as PlannedDistributionShare[], llcFallbackAmount: ownerAmount };
  }

  const baseAmount = Math.floor(ownerAmount / members.length);
  const memberShares: PlannedDistributionShare[] = [];
  let llcFallbackAmount = 0;

  for (let index = 0; index < members.length; index += 1) {
    const member = members[index];
    const amountCents = baseAmount + (index === 0 ? ownerAmount - baseAmount * members.length : 0);
    if (amountCents <= 0) {
      continue;
    }
    if (!member.payoutStripeAccountId) {
      llcFallbackAmount += amountCents;
      continue;
    }
    memberShares.push({
      profileId: member.profileId,
      amountCents,
      distributionPct: roundPct(100 / members.length),
      destination: member.payoutStripeAccountId
    });
  }

  return { memberShares, llcFallbackAmount };
}

export function planCustomDistributionTransfers(
  ownerAmount: number,
  members: DistributionMemberRow[]
) {
  const normalizedMembers = members.map((member) => ({
    ...member,
    distributionPct: member.distributionPct ?? 0
  }));
  const totalPct = normalizedMembers.reduce((sum, member) => sum + member.distributionPct, 0);
  if (totalPct <= 0) {
    return { memberShares: [] as PlannedDistributionShare[], llcFallbackAmount: ownerAmount };
  }

  const floorAmounts = normalizedMembers.map((member) =>
    Math.floor(ownerAmount * (member.distributionPct / totalPct))
  );
  const remainder = ownerAmount - floorAmounts.reduce((sum, amount) => sum + amount, 0);
  const memberShares: PlannedDistributionShare[] = [];
  let llcFallbackAmount = 0;

  for (let index = 0; index < normalizedMembers.length; index += 1) {
    const member = normalizedMembers[index];
    const amountCents = floorAmounts[index] + (index === 0 ? remainder : 0);
    if (amountCents <= 0) {
      continue;
    }
    if (!member.payoutStripeAccountId) {
      llcFallbackAmount += amountCents;
      continue;
    }
    memberShares.push({
      profileId: member.profileId,
      amountCents,
      distributionPct: member.distributionPct,
      destination: member.payoutStripeAccountId
    });
  }

  return { memberShares, llcFallbackAmount };
}

export function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function toDistributionMode(value: string | null | undefined): DistributionMode {
  if (value === "split_equal" || value === "split_custom") {
    return value;
  }
  return "retain";
}

export function buildEqualDistribution(profileIds: string[]): DistributionMemberConfig[] {
  if (profileIds.length === 0) {
    return [];
  }

  const equalPct = roundPct(100 / profileIds.length);
  const firstPct = roundPct(100 - equalPct * (profileIds.length - 1));

  return profileIds.map((profileId, index) => ({
    profileId,
    pct: index === 0 ? firstPct : equalPct
  }));
}

export function validateDistributionConfig(
  mode: string,
  memberPcts: Map<string, number>
): { valid: boolean; error?: string } {
  if (mode === "retain" || mode === "split_equal") {
    return { valid: true };
  }

  if (mode !== "split_custom") {
    return { valid: false, error: "Invalid distribution mode." };
  }

  const total = Array.from(memberPcts.values()).reduce((sum, pct) => sum + pct, 0);
  if (Math.abs(total - 100) > 0.01) {
    return {
      valid: false,
      error: `Percentages must sum to 100%. Current total: ${total.toFixed(2)}%`
    };
  }

  for (const pct of memberPcts.values()) {
    if (pct < 0 || pct > 100) {
      return { valid: false, error: "Each percentage must be between 0 and 100." };
    }
  }

  return { valid: true };
}

export function buildDistributionConfigSnapshot(
  mode: DistributionMode,
  profileIds: string[],
  memberPcts?: Map<string, number>
): DistributionConfigSnapshot {
  if (mode === "retain") {
    return {
      mode,
      members: profileIds.map((profileId) => ({ profileId, pct: null }))
    };
  }

  if (mode === "split_equal") {
    return {
      mode,
      members: buildEqualDistribution(profileIds)
    };
  }

  return {
    mode,
    members: profileIds.map((profileId) => ({
      profileId,
      pct: roundPct(memberPcts?.get(profileId) ?? 0)
    }))
  };
}
