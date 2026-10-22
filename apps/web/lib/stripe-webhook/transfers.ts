import "server-only";
import {
  getDistributionMembersForAccount,
  planCustomDistributionTransfers,
  planEqualDistributionTransfers,
  recordPaymentDistribution
} from "@/lib/distributions";
import { createStripeTransfer } from "@/lib/stripe";
import { getManagerStripeAccountForProperty, getOwnerStripeAccountForProperty } from "@/lib/stripe-connect";
import { managerFeeBaseForCharge } from "@/lib/charge-lines";
import { type AdminClient, type Match } from "./context";
import { notifyManagerOfFeeTransfer } from "./notify";

export async function createTransfersForPayment(
  supabase: AdminClient,
  params: {
    propertyId: string;
    chargeId: string;
    amountCents: number;
    transferGroup: string;
    paymentMatch: Match;
    managerFeeCentsOverride?: number | null;
  }
) {
  const paymentUpdate: Record<string, string | number> = { platform_fee_cents: 0 };
  let firstTransferId: string | null = null;

  try {
    const ownerStripeAccount = await getOwnerStripeAccountForProperty(params.propertyId);
    if (!ownerStripeAccount) {
      return;
    }

    const hasManagerFeeOverride =
      typeof params.managerFeeCentsOverride === "number" &&
      Number.isFinite(params.managerFeeCentsOverride);
    const feeBaseCents = hasManagerFeeOverride ? params.amountCents
      : await managerFeeBaseForCharge({ id: params.chargeId, amount_cents: params.amountCents });
    const managerInfo = await getManagerStripeAccountForProperty(params.propertyId, feeBaseCents);
    const managerFeeOverride = hasManagerFeeOverride ? Number(params.managerFeeCentsOverride) : 0;
    const managementFee = hasManagerFeeOverride
      ? Math.max(managerFeeOverride, 0)
      : Math.max(managerInfo?.feeCents ?? 0, 0);
    const effectiveFee = Math.min(managementFee, params.amountCents);
    const ownerAmount = params.amountCents - effectiveFee;

    if (ownerAmount > 0) {
      const { data: property } = await supabase
        .from("properties")
        .select("owner_account_id")
        .eq("id", params.propertyId)
        .maybeSingle();
      const ownerAccountId = property?.owner_account_id ?? null;
      let distributed = false;

      if (ownerAccountId) {
        const distribution = await getDistributionMembersForAccount(ownerAccountId);
        if (distribution.mode !== "retain" && distribution.members.length > 0) {
          const planned = distribution.mode === "split_equal"
            ? planEqualDistributionTransfers(ownerAmount, distribution.members)
            : planCustomDistributionTransfers(ownerAmount, distribution.members);

          if (planned.memberShares.length > 0) {
            const { data: payment } = await supabase
              .from("payments")
              .select("id")
              .eq(params.paymentMatch.column, params.paymentMatch.value)
              .maybeSingle();

            if (planned.llcFallbackAmount > 0) {
              const llcTransfer = await createStripeTransfer({
                amountCents: planned.llcFallbackAmount,
                destination: ownerStripeAccount,
                transferGroup: params.transferGroup,
                description: `LLC retained share for charge ${params.chargeId.slice(0, 8)}`
              });
              firstTransferId = llcTransfer.id;
            }

            for (const share of planned.memberShares) {
              try {
                const transfer = await createStripeTransfer({
                  amountCents: share.amountCents,
                  destination: share.destination,
                  transferGroup: params.transferGroup,
                  description: `Distribution for charge ${params.chargeId.slice(0, 8)}`
                });
                firstTransferId ??= transfer.id;
                await recordPaymentDistribution({
                  paymentId: payment?.id ?? null,
                  accountId: ownerAccountId,
                  profileId: share.profileId,
                  amountCents: share.amountCents,
                  distributionPct: share.distributionPct,
                  stripeTransferId: transfer.id,
                  status: "completed"
                });
              } catch (transferError) {
                console.error(`[stripe-webhook] Member transfer failed for ${share.profileId}:`, transferError);
                try {
                  const fallbackTransfer = await createStripeTransfer({
                    amountCents: share.amountCents,
                    destination: ownerStripeAccount,
                    transferGroup: params.transferGroup,
                    description: `LLC fallback share for charge ${params.chargeId.slice(0, 8)}`
                  });
                  firstTransferId ??= fallbackTransfer.id;
                } catch (fallbackError) {
                  console.error(`[stripe-webhook] LLC fallback transfer failed for ${share.profileId}:`, fallbackError);
                }
                await recordPaymentDistribution({
                  paymentId: payment?.id ?? null,
                  accountId: ownerAccountId,
                  profileId: share.profileId,
                  amountCents: share.amountCents,
                  distributionPct: share.distributionPct,
                  stripeTransferId: null,
                  status: "failed"
                });
              }
            }

            distributed = true;
          }
        }
      }

      if (!distributed) {
        const ownerTransfer = await createStripeTransfer({
          amountCents: ownerAmount,
          destination: ownerStripeAccount,
          transferGroup: params.transferGroup,
          description: `Rent payment for charge ${params.chargeId.slice(0, 8)}`
        });
        firstTransferId = ownerTransfer.id;
      }
    }

    if (firstTransferId) {
      paymentUpdate.stripe_transfer_id = firstTransferId;
    }
    if (managerInfo && effectiveFee > 0) {
      const managerTransfer = await createStripeTransfer({
        amountCents: effectiveFee,
        destination: managerInfo.accountId,
        transferGroup: params.transferGroup,
        description: `Management fee for charge ${params.chargeId.slice(0, 8)}`
      });
      paymentUpdate.manager_transfer_id = managerTransfer.id;
      notifyManagerOfFeeTransfer(supabase, {
        managerProfileId: managerInfo.managerProfileId,
        amountCents: effectiveFee,
        chargeId: params.chargeId,
        managerPaymentId: managerTransfer.id
      });
    }
  } catch (transferError) {
    console.error("[stripe-webhook] Transfer creation failed:", transferError);
  } finally {
    if (firstTransferId) {
      paymentUpdate.stripe_transfer_id = firstTransferId;
    }

    if (Object.keys(paymentUpdate).length > 1 || firstTransferId) {
      const { error } = await supabase
        .from("payments")
        .update(paymentUpdate)
        .eq(params.paymentMatch.column, params.paymentMatch.value);
      if (error) {
        console.error("[stripe-webhook] RECONCILIATION: update payment transfer metadata:", error);
      }
    }
  }
}
