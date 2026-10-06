import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentMethod, retrieveSetupIntent } from "@/lib/autopay";
import { retrieveStripeCheckoutSession } from "@/lib/stripe";

export const dynamic = "force-dynamic";

interface AutopayReturnPageProps {
  searchParams?: Promise<{
    setup_intent?: string | string[];
    session_id?: string | string[];
    lease_id?: string | string[];
  }>;
}

function getSingleValue(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return null;
}

export default async function AutopayReturnPage(props: AutopayReturnPageProps) {
  const searchParams = await props.searchParams;
  const user = await getAuthenticatedUser();
  const setupIntentParam = getSingleValue(searchParams?.setup_intent);
  const sessionId = getSingleValue(searchParams?.session_id);
  const leaseId = getSingleValue(searchParams?.lease_id);

  let outcome: "enrolled" | "error" = "error";

  if (leaseId) {
    try {
      const admin = createAdminClient();
      const { data: lease } = await admin
        .from("leases")
        .select("id, tenant_profile_id")
        .eq("id", leaseId)
        .eq("tenant_profile_id", user.id)
        .maybeSingle();

      if (lease) {
        let setupIntentId = setupIntentParam;
        if (!setupIntentId && sessionId) {
          const session = await retrieveStripeCheckoutSession(sessionId);
          setupIntentId = typeof session.setup_intent === "string" ? session.setup_intent : null;
        }

        if (setupIntentId) {
          const setupIntent = await retrieveSetupIntent(setupIntentId);
          const paymentMethod = await getPaymentMethod(setupIntent.payment_method);

          if (paymentMethod.card?.last4) {
            const { error } = await admin.from("autopay_enrollments").upsert(
              {
                lease_id: lease.id,
                tenant_profile_id: user.id,
                stripe_payment_method_id: paymentMethod.id,
                payment_method_type: paymentMethod.type,
                last4: paymentMethod.card.last4,
                brand: paymentMethod.card.brand ?? null,
                enabled: true,
                retry_count: 0,
                last_failed_at: null,
                updated_at: new Date().toISOString()
              },
              { onConflict: "lease_id" }
            );
            if (!error) outcome = "enrolled";
          }
        }
      }
    } catch {
      outcome = "error";
    }
  }

  redirect(`/tenant?section=charges&autopay=${outcome}`);
}
