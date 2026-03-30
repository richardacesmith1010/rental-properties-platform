const CARD_FEE_RATE = 0.029;
const CARD_FEE_FIXED_CENTS = 30;

export function calculateCardFee(baseCents: number): {
  baseCents: number;
  feeCents: number;
  totalCents: number;
} {
  const totalCents = Math.ceil(
    (baseCents + CARD_FEE_FIXED_CENTS) / (1 - CARD_FEE_RATE)
  );
  const feeCents = totalCents - baseCents;

  return {
    baseCents,
    feeCents,
    totalCents
  };
}

export function formatCentsAsDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD"
  });
}

export async function getManagerFeeForProperty(
  propertyId: string,
  rentAmountCents: number
): Promise<{ feeCents: number; managerProfileId: string | null }> {
  const [{ createAdminClient }, { isMissingSchemaError }] = await Promise.all([
    import("@/lib/supabase/admin"),
    import("@/lib/supabase-errors")
  ]);
  const supabase = createAdminClient();
  const configQuery = await supabase
    .from("manager_payment_configs")
    .select("manager_profile_id, payment_type, percentage_rate, flat_amount_cents, base_rent_cents, active, created_at")
    .eq("property_id", propertyId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (configQuery.error && !isMissingSchemaError(configQuery.error)) {
    throw configQuery.error;
  }

  const config = configQuery.data;
  if (config) {
    const rawFeeCents = config.payment_type === "flat"
      ? config.flat_amount_cents ?? 0
      : Math.round((config.base_rent_cents ?? rentAmountCents) * ((config.percentage_rate ?? 0) / 100));

    return {
      feeCents: Math.max(rawFeeCents, 0),
      managerProfileId: config.manager_profile_id ?? null
    };
  }

  const propertyQuery = await supabase
    .from("properties")
    .select("management_fee_cents")
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyQuery.error && !isMissingSchemaError(propertyQuery.error)) {
    throw propertyQuery.error;
  }

  return {
    feeCents: Math.max(propertyQuery.data?.management_fee_cents ?? 0, 0),
    managerProfileId: null
  };
}
