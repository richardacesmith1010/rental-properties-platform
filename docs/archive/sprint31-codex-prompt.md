# Sprint 31 — Distribution Engine + Account Creation UX

## Objective

Add the distribution engine so rent payments can be auto-split among LLC members, add per-member payout Stripe Connect, and surface a "+ New Account" button in the account switcher for discoverability.

## Context

- **Branch:** `main`
- **HEAD:** `64f6f5c`
- **Gate baseline:** 503/503 tests, lint clean, typecheck clean, build clean
- **Supabase project:** `vawqdqkaguhdgfhdebqw`

Sprint 30B shipped: account switcher, per-account Stripe Connect, dashboard data scoping, distribution schema columns (`distribution_mode`, `distribution_pct`, `payout_stripe_account_id`). This sprint implements the actual money-splitting logic and UI.

## In Scope

1. "+ New Account" button in account switcher
2. Distribution config UI (mode selector + percentage inputs per LLC member)
3. Per-member payout Stripe Connect (separate from the LLC account's Stripe)
4. Distribution config server actions
5. Modified webhook transfer flow for auto-splits
6. Schema migration: `payment_distributions` table
7. Distribution history view in ownership section

## Out of Scope

- Approval/voting workflow for distribution changes (Sprint 32)
- Withdrawal requests (Sprint 32)
- Plaid integration / bank account visibility (Sprint 32)
- Test file modifications
- New npm dependencies
- CLAUDE.md / AGENTS.md modifications

## Exact Files Expected to Change

### New Files (4)

1. `apps/web/components/dashboard/distribution-config-panel.tsx`
2. `apps/web/components/dashboard/distribution-history.tsx`
3. `apps/web/lib/distributions.ts`
4. `apps/web/app/actions/distributions.ts`

### Modified Files (10)

1. `apps/web/components/dashboard/account-switcher.tsx`
2. `apps/web/components/dashboard/ownership-section.tsx`
3. `apps/web/components/dashboard/section-renderer.tsx`
4. `apps/web/components/dashboard/types.ts`
5. `apps/web/components/dashboard/index.tsx`
6. `apps/web/app/api/webhooks/stripe/route.ts`
7. `apps/web/app/actions/connect.ts`
8. `apps/web/app/actions/index.ts`
9. `apps/web/app/connect/return/page.tsx`
10. `apps/web/app/owner/page.tsx`

### Migration File (1)

11. `supabase/migrations/20260315_sprint31_distribution_engine.sql`

## Implementation Requirements

---

### Part A: "+ New Account" in Account Switcher

**File:** `apps/web/components/dashboard/account-switcher.tsx`

Add a "+ New Account" button below the account display in **both** the single-account view AND the multi-account view. On click, navigate to `?mode=records&section=ownership` which opens the ownership section's Create Account flow.

```tsx
// Add import at top:
import { Plus } from "lucide-react";

// In the single-account view (after the closing </div> of the mt-2 flex block, before the closing </div> of the outer container):
<button
  type="button"
  onClick={() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", "records");
    params.set("section", "ownership");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }}
  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/60 transition hover:bg-white/10 hover:text-white/80"
  title="Create a new ownership account."
>
  <Plus className="h-3 w-3" />
  New Account
</button>

// In the multi-account view (after the </select>, before the closing </div> of the outer container):
// Same button as above
```

---

### Part B: Distribution Config Panel

**New file:** `apps/web/components/dashboard/distribution-config-panel.tsx`

A `"use client"` component rendered within the ownership section when the user clicks "Configure Distribution" on an LLC account.

```tsx
"use client";

import { type KeyboardEvent, useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import type { ActionState } from "@/app/actions";
import type { OwnershipMemberDTO } from "@/lib/ownership";

type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface DistributionConfigPanelProps {
  accountId: string;
  accountDisplayName: string;
  currentMode: string; // "retain" | "split_equal" | "split_custom"
  members: OwnershipMemberDTO[];
  onUpdateDistributionConfig: StatefulAction;
  onInitiateMemberPayoutConnect?: StatefulAction;
}
```

**Requirements:**
- Three radio buttons: "Retain All" (`retain`), "Split Equally" (`split_equal`), "Custom Split" (`split_custom`)
- When mode is `split_custom`, show a list of active members with:
  - Name + email
  - A number input for percentage (0–100, step 0.01)
  - Payout Stripe status: Badge showing "Payout Connected" (success) or "Not Connected" (outline)
  - "Connect Payout" button if not connected (calls `onInitiateMemberPayoutConnect` with hidden fields `accountId` + `profileId`)
- Below the member list, show a "Total: X%" indicator — green if 100%, red otherwise
- **Validation**: Disable the Save button unless total = 100% for custom mode
- Save form posts hidden fields: `accountId`, `mode`, and for each member `pct_{profileId}` with the percentage value
- Use `useFormState` with `onUpdateDistributionConfig`
- After successful save, show success Alert
- When mode is `split_equal`, show a read-only display: "Each member receives an equal share" with the computed percentage per member
- When mode is `retain`, show: "All funds stay in the LLC account"

---

### Part C: Distribution History

**New file:** `apps/web/components/dashboard/distribution-history.tsx`

A `"use client"` component showing recent distributions for the active account.

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { DollarSign } from "lucide-react";
import type { DistributionHistoryEntry } from "@/lib/distributions";

interface DistributionHistoryProps {
  entries: DistributionHistoryEntry[];
}
```

**Requirements:**
- Show a card with "Distribution History" title
- Each entry shows: date (formatted), member name, amount (dollars), percentage, status badge
- Status badge: "completed" = success variant, "failed" = error variant, "pending" = warning variant
- Empty state: "No distributions yet" with DollarSign icon
- Max 20 entries displayed

---

### Part D: Lib — Distribution Functions

**New file:** `apps/web/lib/distributions.ts`

```typescript
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerOwnershipAccount } from "@/lib/ownership";

export interface DistributionHistoryEntry {
  id: string;
  paymentId: string;
  memberProfileId: string;
  memberName: string;
  memberEmail: string;
  amountCents: number;
  distributionPct: number | null;
  stripeTransferId: string | null;
  status: "completed" | "failed" | "pending";
  createdAt: string;
}

export async function getDistributionHistory(
  accountId: string,
  limit = 20
): Promise<DistributionHistoryEntry[]> {
  // Query payment_distributions joined with profiles for member names
  // Filter by account_id, order by created_at desc, limit
  // Handle missing table gracefully (return [] if table doesn't exist)
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payment_distributions")
    .select("id, payment_id, member_profile_id, amount_cents, distribution_pct, stripe_transfer_id, status, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  const profileIds = [...new Set(data.map((row) => row.member_profile_id))];
  if (profileIds.length === 0) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", profileIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  return data.map((row) => {
    const profile = profileMap.get(row.member_profile_id);
    return {
      id: row.id,
      paymentId: row.payment_id,
      memberProfileId: row.member_profile_id,
      memberName: profile?.full_name ?? "Unknown",
      memberEmail: profile?.email ?? "unknown",
      amountCents: row.amount_cents,
      distributionPct: row.distribution_pct !== null ? Number(row.distribution_pct) : null,
      stripeTransferId: row.stripe_transfer_id,
      status: row.status as "completed" | "failed" | "pending",
      createdAt: row.created_at
    };
  });
}

export function validateDistributionConfig(
  mode: string,
  memberPcts: Map<string, number>
): { valid: boolean; error?: string } {
  if (mode === "retain") return { valid: true };
  if (mode === "split_equal") return { valid: true };
  if (mode !== "split_custom") return { valid: false, error: "Invalid distribution mode." };

  const total = Array.from(memberPcts.values()).reduce((sum, pct) => sum + pct, 0);
  // Allow floating point tolerance
  if (Math.abs(total - 100) > 0.01) {
    return { valid: false, error: `Percentages must sum to 100%. Current total: ${total.toFixed(2)}%` };
  }

  for (const [, pct] of memberPcts) {
    if (pct < 0 || pct > 100) {
      return { valid: false, error: "Each percentage must be between 0 and 100." };
    }
  }

  return { valid: true };
}

/** Fetch distribution-eligible members for the auto-split transfer flow */
export async function getDistributionMembersForAccount(accountId: string): Promise<{
  mode: string;
  members: Array<{
    profileId: string;
    distributionPct: number | null;
    payoutStripeAccountId: string | null;
  }>;
}> {
  const admin = createAdminClient();

  const [{ data: account }, { data: members }] = await Promise.all([
    admin
      .from("ownership_accounts")
      .select("distribution_mode")
      .eq("id", accountId)
      .maybeSingle(),
    admin
      .from("ownership_account_members")
      .select("profile_id, distribution_pct, payout_stripe_account_id")
      .eq("account_id", accountId)
      .eq("active", true)
  ]);

  return {
    mode: account?.distribution_mode ?? "retain",
    members: (members ?? []).map((m) => ({
      profileId: m.profile_id,
      distributionPct: m.distribution_pct !== null ? Number(m.distribution_pct) : null,
      payoutStripeAccountId: m.payout_stripe_account_id ?? null
    }))
  };
}
```

---

### Part E: Distribution Actions

**New file:** `apps/web/app/actions/distributions.ts`

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerOwnershipAccount } from "@/lib/ownership";
import { validateDistributionConfig } from "@/lib/distributions";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

export async function updateDistributionConfig(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireAuth("owner");
  const accountId = formData.get("accountId");
  const mode = formData.get("mode");

  if (typeof accountId !== "string" || !accountId) {
    return { success: false, error: "Missing account ID." };
  }
  if (typeof mode !== "string" || !["retain", "split_equal", "split_custom"].includes(mode)) {
    return { success: false, error: "Invalid distribution mode." };
  }

  const canAdmin = await canUserAdministerOwnershipAccount(user.id, accountId);
  if (!canAdmin) {
    return { success: false, error: "Access denied." };
  }

  const admin = createAdminClient();

  // Get active members
  const { data: members } = await admin
    .from("ownership_account_members")
    .select("profile_id")
    .eq("account_id", accountId)
    .eq("active", true);

  const activeMembers = members ?? [];

  if (mode === "retain") {
    // Clear all percentages
    await admin
      .from("ownership_account_members")
      .update({ distribution_pct: null })
      .eq("account_id", accountId);

    await admin
      .from("ownership_accounts")
      .update({ distribution_mode: "retain" })
      .eq("id", accountId);

    revalidatePath("/owner");
    return { success: true, message: "Distribution set to retain all funds in LLC account." };
  }

  if (mode === "split_equal") {
    if (activeMembers.length === 0) {
      return { success: false, error: "No active members to split between." };
    }

    const equalPct = Math.round((10000 / activeMembers.length)) / 100; // 2 decimal places
    // Adjust first member to absorb rounding
    const firstPct = 100 - equalPct * (activeMembers.length - 1);

    for (let i = 0; i < activeMembers.length; i++) {
      await admin
        .from("ownership_account_members")
        .update({ distribution_pct: i === 0 ? firstPct : equalPct })
        .eq("account_id", accountId)
        .eq("profile_id", activeMembers[i].profile_id);
    }

    await admin
      .from("ownership_accounts")
      .update({ distribution_mode: "split_equal" })
      .eq("id", accountId);

    revalidatePath("/owner");
    return { success: true, message: `Distribution set to equal split (${activeMembers.length} members).` };
  }

  // split_custom
  const memberPcts = new Map<string, number>();
  for (const member of activeMembers) {
    const rawPct = formData.get(`pct_${member.profile_id}`);
    const pct = rawPct !== null ? parseFloat(String(rawPct)) : 0;
    if (isNaN(pct)) {
      return { success: false, error: `Invalid percentage for a member.` };
    }
    memberPcts.set(member.profile_id, pct);
  }

  const validation = validateDistributionConfig(mode, memberPcts);
  if (!validation.valid) {
    return { success: false, error: validation.error ?? "Invalid configuration." };
  }

  for (const [profileId, pct] of memberPcts) {
    await admin
      .from("ownership_account_members")
      .update({ distribution_pct: pct })
      .eq("account_id", accountId)
      .eq("profile_id", profileId);
  }

  await admin
    .from("ownership_accounts")
    .update({ distribution_mode: "split_custom" })
    .eq("id", accountId);

  revalidatePath("/owner");
  return { success: true, message: "Custom distribution percentages saved." };
}
```

**Add to `apps/web/app/actions/index.ts`:**
```typescript
export { updateDistributionConfig } from "./distributions";
export { initiateMemberPayoutConnect } from "./connect";
```

---

### Part F: Per-Member Payout Stripe Connect

**File:** `apps/web/app/actions/connect.ts`

Add a new exported action after `initiateAccountStripeConnect`:

```typescript
export async function initiateMemberPayoutConnect(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { user } = await requireConnectedRole();
    const accountId = formData.get("accountId");
    const profileId = formData.get("profileId");

    if (typeof accountId !== "string" || !accountId) {
      return { success: false, error: "Missing account ID." };
    }
    if (typeof profileId !== "string" || !profileId) {
      return { success: false, error: "Missing member profile ID." };
    }
    if (!checkRateLimit(`initiateMemberPayoutConnect:${user.id}`, 5, 60 * 60 * 1000).allowed) {
      return { success: false, error: "Too many requests. Please try again later." };
    }

    // Verify caller is a member of this account
    const { canUserAdministerOwnershipAccount } = await import("@/lib/ownership");
    const canAdmin = await canUserAdministerOwnershipAccount(user.id, accountId);
    if (!canAdmin) {
      return { success: false, error: "Access denied." };
    }

    const admin = createAdminClient();

    // Verify target is a member of the account
    const { data: membership } = await admin
      .from("ownership_account_members")
      .select("profile_id, payout_stripe_account_id")
      .eq("account_id", accountId)
      .eq("profile_id", profileId)
      .eq("active", true)
      .maybeSingle();

    if (!membership) {
      return { success: false, error: "Member not found in this account." };
    }

    let stripeAccountId = membership.payout_stripe_account_id ?? null;
    if (!stripeAccountId) {
      // Get the member's email
      const { data: profile } = await admin
        .from("profiles")
        .select("email")
        .eq("id", profileId)
        .maybeSingle();

      if (!profile?.email) {
        return { success: false, error: "Member has no email address on file." };
      }

      const stripeAccount = await createExpressAccount(profile.email);
      stripeAccountId = stripeAccount.id;

      const { error } = await admin
        .from("ownership_account_members")
        .update({ payout_stripe_account_id: stripeAccountId })
        .eq("account_id", accountId)
        .eq("profile_id", profileId);

      if (error) {
        return { success: false, error: "Failed to save payout account." };
      }
    }

    const appUrl = getAppUrl();
    const accountLink = await createAccountLink(
      stripeAccountId,
      `${appUrl}/connect/refresh?accountId=${encodeURIComponent(accountId)}&memberPayout=true`,
      `${appUrl}/connect/return?accountId=${encodeURIComponent(accountId)}&memberPayout=true`
    );

    return { success: true, url: accountLink.url };
  } catch (err) {
    console.error("initiateMemberPayoutConnect error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Unable to start payout onboarding. (${detail})`
    };
  }
}
```

---

### Part G: Connect Return Page — Member Payout Handling

**File:** `apps/web/app/connect/return/page.tsx`

Update the interface and page component:

```typescript
// Update interface:
interface ConnectReturnPageProps {
  searchParams?: {
    accountId?: string | string[];
    memberPayout?: string | string[];
  };
}

// In ConnectReturnPage, add after accountId parsing:
const isMemberPayout =
  (typeof searchParams?.memberPayout === "string" && searchParams.memberPayout === "true") ||
  (Array.isArray(searchParams?.memberPayout) && searchParams.memberPayout[0] === "true");
```

When `isMemberPayout` is true AND `accountId` is present, the `checkConnectStatus` call should still use `accountId` (which already checks the ownership account's Stripe). But we also need a separate status check for the member's payout account. For simplicity, keep the existing `checkConnectStatus(accountId)` call as-is — the member payout status is updated by the webhook's `account.updated` handler (Part H below). The return page behavior stays the same: show connected/pending/incomplete status.

No behavior change needed in the return page beyond accepting the `memberPayout` param for URL routing. The `dashboardPath` should include `memberPayout` context:

```typescript
const dashboardPath = accountId
  ? role === "owner"
    ? `/owner?section=ownership&account=${encodeURIComponent(accountId)}`
    : "/manager?section=ownership"
  : getRoleHomePath(role);
```

This is already correct. No functional change to the return page logic, only the interface update to accept `memberPayout`.

---

### Part H: Webhook — Member Payout Status + Auto-Split Transfers

**File:** `apps/web/app/api/webhooks/stripe/route.ts`

#### H.1: Update `account.updated` handler (lines 376-404)

Add a **third** write to also update member payout accounts:

```typescript
// After the existing Promise.all with profileUpdate and ownershipUpdate:
// Add:
const memberPayoutUpdate = await supabase
  .from("ownership_account_members")
  .update({ /* no onboarding flag on members — the presence of payout_stripe_account_id is sufficient */ })
  .eq("payout_stripe_account_id", accountId);
// Actually, there's no onboarding_complete flag on members. The payout_stripe_account_id IS the indicator.
// So we just need to know it's connected. We can verify by checking if charges/payouts enabled.
// For member payouts, the webhook confirmation that charges+payouts are enabled means the member's payout account is ready.
// No extra column needed — the existence of payout_stripe_account_id + the Stripe account being fully onboarded is enough.
// The distribution flow checks the Stripe account status at transfer time.
```

Actually, since there's no `payout_onboarding_complete` column on members, and we don't need one (the transfer flow will use the payout_stripe_account_id directly and Stripe will reject transfers to non-onboarded accounts), **no change is needed** to the `account.updated` handler for member payouts. The existing dual-write for profiles + ownership_accounts is sufficient.

#### H.2: Modify `createTransfersForPayment()` (lines 206-257)

Add an import at the top of the file:
```typescript
import { getDistributionMembersForAccount } from "@/lib/distributions";
```

Replace the body of `createTransfersForPayment` with the new distribution-aware logic:

```typescript
async function createTransfersForPayment(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    propertyId: string;
    chargeId: string;
    amountCents: number;
    transferGroup: string;
    paymentMatch: { column: "stripe_checkout_session_id" | "stripe_payment_intent_id"; value: string };
  }
) {
  try {
    const ownerStripeAccount = await getOwnerStripeAccountForProperty(params.propertyId);
    if (!ownerStripeAccount) {
      return;
    }

    const managerInfo = await getManagerStripeAccountForProperty(params.propertyId);
    const managementFee = managerInfo?.feeCents ?? 0;
    const platformFee = 0;
    const ownerAmount = params.amountCents - managementFee - platformFee;
    const paymentUpdate: Record<string, string | number> = {
      platform_fee_cents: platformFee
    };

    if (ownerAmount > 0) {
      // Check distribution mode for this property's ownership account
      const property = await supabase
        .from("properties")
        .select("owner_account_id")
        .eq("id", params.propertyId)
        .maybeSingle();

      const ownerAccountId = property.data?.owner_account_id;
      let distributed = false;

      if (ownerAccountId) {
        const { mode, members } = await getDistributionMembersForAccount(ownerAccountId);

        if (mode !== "retain" && members.length > 0) {
          const membersWithPayout = members.filter((m) => m.payoutStripeAccountId);

          if (membersWithPayout.length > 0) {
            // Calculate shares
            let shares: Array<{ profileId: string; amountCents: number; pct: number | null; destination: string }> = [];

            if (mode === "split_equal") {
              const perMember = Math.floor(ownerAmount / membersWithPayout.length);
              let remainder = ownerAmount - perMember * membersWithPayout.length;

              shares = membersWithPayout.map((m, i) => ({
                profileId: m.profileId,
                amountCents: perMember + (i === 0 ? remainder : 0),
                pct: Math.round((10000 / membersWithPayout.length)) / 100,
                destination: m.payoutStripeAccountId!
              }));
            } else if (mode === "split_custom") {
              // Only members with BOTH a payout account AND a distribution_pct
              const eligibleMembers = membersWithPayout.filter(
                (m) => m.distributionPct !== null && m.distributionPct > 0
              );

              if (eligibleMembers.length > 0) {
                const totalPct = eligibleMembers.reduce((sum, m) => sum + (m.distributionPct ?? 0), 0);
                let allocated = 0;

                shares = eligibleMembers.map((m, i) => {
                  const rawAmount = Math.floor(ownerAmount * ((m.distributionPct ?? 0) / totalPct));
                  allocated += rawAmount;
                  return {
                    profileId: m.profileId,
                    amountCents: rawAmount,
                    pct: m.distributionPct,
                    destination: m.payoutStripeAccountId!
                  };
                });

                // Assign remainder cents to first member
                const remainder = ownerAmount - allocated;
                if (remainder > 0 && shares.length > 0) {
                  shares[0].amountCents += remainder;
                }
              }
            }

            // Members without a payout account: their share goes to the LLC account
            const membersWithoutPayout = members.filter((m) => !m.payoutStripeAccountId);
            if (membersWithoutPayout.length > 0 && mode === "split_equal") {
              // Calculate the share that should go to non-payout members
              const allMemberCount = members.length;
              const withoutPayoutShare = Math.floor(ownerAmount * (membersWithoutPayout.length / allMemberCount));

              if (withoutPayoutShare > 0) {
                // Recalculate: give payout members their share, rest goes to LLC
                const payoutMemberAmount = ownerAmount - withoutPayoutShare;
                const perMember = Math.floor(payoutMemberAmount / membersWithPayout.length);
                let remainder = payoutMemberAmount - perMember * membersWithPayout.length;

                shares = membersWithPayout.map((m, i) => ({
                  profileId: m.profileId,
                  amountCents: perMember + (i === 0 ? remainder : 0),
                  pct: Math.round((10000 / allMemberCount)) / 100,
                  destination: m.payoutStripeAccountId!
                }));

                // Transfer the non-payout share to LLC account
                if (withoutPayoutShare > 0) {
                  const llcTransfer = await createStripeTransfer({
                    amountCents: withoutPayoutShare,
                    destination: ownerStripeAccount,
                    transferGroup: params.transferGroup,
                    description: `LLC retained share for charge ${params.chargeId.slice(0, 8)}`
                  });
                  paymentUpdate.stripe_transfer_id = llcTransfer.id;
                }
              }
            }

            // Execute member transfers
            if (shares.length > 0) {
              let firstTransferId: string | null = null;

              for (const share of shares) {
                if (share.amountCents <= 0) continue;

                try {
                  const transfer = await createStripeTransfer({
                    amountCents: share.amountCents,
                    destination: share.destination,
                    transferGroup: params.transferGroup,
                    description: `Distribution for charge ${params.chargeId.slice(0, 8)}`
                  });

                  if (!firstTransferId) {
                    firstTransferId = transfer.id;
                  }

                  // Record in payment_distributions
                  // Get payment ID from the payment match
                  const { data: payment } = await supabase
                    .from("payments")
                    .select("id")
                    .eq(params.paymentMatch.column, params.paymentMatch.value)
                    .maybeSingle();

                  if (payment?.id) {
                    await supabase.from("payment_distributions").insert({
                      payment_id: payment.id,
                      account_id: ownerAccountId,
                      member_profile_id: share.profileId,
                      amount_cents: share.amountCents,
                      distribution_pct: share.pct,
                      stripe_transfer_id: transfer.id,
                      status: "completed"
                    });
                  }
                } catch (transferErr) {
                  console.error(`[stripe-webhook] Member transfer failed for ${share.profileId}:`, transferErr);

                  // Record failed distribution
                  const { data: payment } = await supabase
                    .from("payments")
                    .select("id")
                    .eq(params.paymentMatch.column, params.paymentMatch.value)
                    .maybeSingle();

                  if (payment?.id) {
                    await supabase.from("payment_distributions").insert({
                      payment_id: payment.id,
                      account_id: ownerAccountId,
                      member_profile_id: share.profileId,
                      amount_cents: share.amountCents,
                      distribution_pct: share.pct,
                      stripe_transfer_id: null,
                      status: "failed"
                    });
                  }
                }
              }

              // Use the first member's transfer ID for backward compat
              if (firstTransferId && !paymentUpdate.stripe_transfer_id) {
                paymentUpdate.stripe_transfer_id = firstTransferId;
              }

              distributed = true;
            }
          }
        }
      }

      // Fallback: if not distributed, do the original single transfer to owner
      if (!distributed) {
        const ownerTransfer = await createStripeTransfer({
          amountCents: ownerAmount,
          destination: ownerStripeAccount,
          transferGroup: params.transferGroup,
          description: `Rent payment for charge ${params.chargeId.slice(0, 8)}`
        });
        paymentUpdate.stripe_transfer_id = ownerTransfer.id;
      }
    }

    if (managerInfo && managementFee > 0) {
      const managerTransfer = await createStripeTransfer({
        amountCents: managementFee,
        destination: managerInfo.accountId,
        transferGroup: params.transferGroup,
        description: `Management fee for charge ${params.chargeId.slice(0, 8)}`
      });
      paymentUpdate.manager_transfer_id = managerTransfer.id;
    }

    await supabase
      .from("payments")
      .update(paymentUpdate)
      .eq(params.paymentMatch.column, params.paymentMatch.value);
  } catch (transferError) {
    console.error("[stripe-webhook] Transfer creation failed:", transferError);
  }
}
```

---

### Part I: Ownership Section Updates

**File:** `apps/web/components/dashboard/ownership-section.tsx`

Add new props and features:

1. **New imports:**
```typescript
import { DistributionConfigPanel } from "./distribution-config-panel";
import { DistributionHistory } from "./distribution-history";
import type { OwnershipMemberDTO } from "@/lib/ownership";
import type { DistributionHistoryEntry } from "@/lib/distributions";
```

2. **Extend `OwnershipSectionProps`:**
```typescript
interface OwnershipSectionProps {
  accounts: OwnershipAccountDTO[];
  properties: PropertyOption[];
  members?: OwnershipMemberDTO[];       // NEW — members of the active distribution account
  distributionHistory?: DistributionHistoryEntry[]; // NEW
  onCreateOwnershipAccount: StatefulAction;
  onLinkPropertyToOwnershipAccount: StatefulAction;
  onInitiateAccountStripeConnect?: StatefulAction;
  onUpdateDistributionConfig?: StatefulAction;       // NEW
  onInitiateMemberPayoutConnect?: StatefulAction;    // NEW
}
```

3. **Add state for distribution config toggle:**
```typescript
const [distributionAccountId, setDistributionAccountId] = useState<string | null>(null);
```

4. **In the account list card**, for each LLC account, add a "Configure Distribution" button:
```tsx
{account.accountType === "llc" && onUpdateDistributionConfig && (
  <Button
    type="button"
    size="sm"
    variant="outline"
    onClick={() =>
      setDistributionAccountId(
        distributionAccountId === account.id ? null : account.id
      )
    }
    title={`Configure how rent payments are distributed for ${account.displayName}.`}
  >
    {distributionAccountId === account.id ? "Hide Distribution" : "Configure Distribution"}
  </Button>
)}
```

5. **Below the account card**, when `distributionAccountId === account.id`:
```tsx
{distributionAccountId === account.id && members && onUpdateDistributionConfig && (
  <DistributionConfigPanel
    accountId={account.id}
    accountDisplayName={account.displayName}
    currentMode={account.distributionMode}
    members={members.filter((m) => m.active)}
    onUpdateDistributionConfig={onUpdateDistributionConfig}
    onInitiateMemberPayoutConnect={onInitiateMemberPayoutConnect}
  />
)}
```

6. **Below the accounts card**, render distribution history:
```tsx
{distributionHistory && distributionHistory.length > 0 && (
  <DistributionHistory entries={distributionHistory} />
)}
```

---

### Part J: Prop Threading

#### `apps/web/components/dashboard/types.ts`

Add new props to `DashboardProps`:
```typescript
// After onInitiateAccountStripeConnect:
onUpdateDistributionConfig?: StatefulAction;
onInitiateMemberPayoutConnect?: StatefulAction;

// Data props (after ownershipAccounts):
ownershipMembers?: import("@/lib/ownership").OwnershipMemberDTO[];
distributionHistory?: import("@/lib/distributions").DistributionHistoryEntry[];
```

#### `apps/web/components/dashboard/section-renderer.tsx`

Add to `SectionRendererProps`:
```typescript
onUpdateDistributionConfig?: StatefulAction;
onInitiateMemberPayoutConnect?: StatefulAction;
ownershipMembers?: import("@/lib/ownership").OwnershipMemberDTO[];
distributionHistory?: import("@/lib/distributions").DistributionHistoryEntry[];
```

Update the OwnershipSection render (around line 435):
```tsx
<OwnershipSection
  accounts={safeOwnershipAccounts}
  properties={safePortfolio.properties.map((property) => ({
    id: property.id,
    name: property.name,
    ownerAccountName: property.ownerAccountName
  }))}
  members={ownershipMembers}
  distributionHistory={distributionHistory}
  onCreateOwnershipAccount={onCreateOwnershipAccount!}
  onLinkPropertyToOwnershipAccount={onLinkPropertyToOwnershipAccount!}
  onInitiateAccountStripeConnect={onInitiateAccountStripeConnect}
  onUpdateDistributionConfig={onUpdateDistributionConfig}
  onInitiateMemberPayoutConnect={onInitiateMemberPayoutConnect}
/>
```

#### `apps/web/components/dashboard/index.tsx`

Destructure and thread the new props through to `SectionRenderer`.

#### `apps/web/app/owner/page.tsx`

1. Import new actions:
```typescript
import { updateDistributionConfig, initiateMemberPayoutConnect } from "@/app/actions";
```

Wait — these need to be re-exported from the actions index. Update imports to use the barrel:
```typescript
import {
  // ... existing imports ...
  updateDistributionConfig,
  initiateMemberPayoutConnect
} from "@/app/actions";
```

2. Import data functions:
```typescript
import { getOwnershipMembersForAccount } from "@/lib/ownership";
import { getDistributionHistory } from "@/lib/distributions";
```

3. After the `Promise.all` block, fetch members and distribution history for the active account:
```typescript
// After the big Promise.all, fetch distribution data for the active LLC account
const activeAccount = ownershipAccounts.find((a) => a.id === activeAccountId);
const isLlcAccount = activeAccount?.accountType === "llc";

const [ownershipMembers, distributionHistory] = await Promise.all([
  isLlcAccount && activeAccountId
    ? getOwnershipMembersForAccount(user.id, activeAccountId)
    : Promise.resolve([]),
  isLlcAccount && activeAccountId
    ? getDistributionHistory(activeAccountId)
    : Promise.resolve([])
]);
```

4. Pass to Dashboard:
```tsx
<Dashboard
  // ... existing props ...
  ownershipMembers={ownershipMembers}
  distributionHistory={distributionHistory}
  onUpdateDistributionConfig={updateDistributionConfig}
  onInitiateMemberPayoutConnect={initiateMemberPayoutConnect}
/>
```

---

### Part K: Schema Migration

**New file:** `supabase/migrations/20260315_sprint31_distribution_engine.sql`

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS payment_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES ownership_accounts(id),
  member_profile_id uuid NOT NULL REFERENCES profiles(id),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  distribution_pct numeric(5,2),
  stripe_transfer_id text,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'pending')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_distributions_payment ON payment_distributions(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_distributions_member ON payment_distributions(member_profile_id);
CREATE INDEX IF NOT EXISTS idx_payment_distributions_account ON payment_distributions(account_id);

-- RLS: owners can read distributions for their accounts
ALTER TABLE payment_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "distributions_select_own" ON payment_distributions
  FOR SELECT USING (
    member_profile_id = auth.uid()
    OR account_id IN (
      SELECT account_id FROM ownership_account_members
      WHERE profile_id = auth.uid() AND active = true
    )
  );

COMMIT;
```

---

## Validation Commands

```bash
npm run gate:web
```

This runs: 503+ tests (36 suites), ESLint strict, TypeScript strict, Next.js production build.

## Acceptance Criteria

1. ✅/❌ "+ New Account" button visible in account switcher (both single and multi-account views), navigates to `?mode=records&section=ownership`
2. ✅/❌ Distribution config panel renders for LLC accounts with three mode options (retain/equal/custom)
3. ✅/❌ `split_custom` validates percentages sum to 100% — Save disabled until valid
4. ✅/❌ `initiateMemberPayoutConnect` action creates Express account, stores `payout_stripe_account_id` on member row, returns onboarding URL
5. ✅/❌ `createTransfersForPayment()` splits payments per distribution mode:
   - `retain` → single transfer to LLC (unchanged behavior)
   - `split_equal` → equal transfers per member with payout account
   - `split_custom` → percentage-based transfers per member
6. ✅/❌ `payment_distributions` table records each member transfer with status
7. ✅/❌ Distribution history visible in ownership section with date/member/amount/status
8. ✅/❌ Members without payout accounts: their share falls back to LLC account
9. ✅/❌ Individual accounts unaffected — no distribution UI shown
10. ✅/❌ `npm run gate:web` passes (503+ tests, lint clean, typecheck clean, build clean)

## Report Format

```
gate_pass: true/false
test_count: N
lint_clean: true/false
typecheck_clean: true/false
build_clean: true/false
files_changed: N
new_files: [list]
modified_files: [list]
```

## Constraints

- Do NOT modify test files
- Do NOT add new npm dependencies
- Do NOT modify CLAUDE.md or AGENTS.md
- Do NOT implement approval/voting workflow (Sprint 32)
- Do NOT implement withdrawal requests (Sprint 32)
- Do NOT implement Plaid integration (Sprint 32)
- Do NOT include "Claude prompt" or "recommended next steps for Claude" sections. Report compact status only.
