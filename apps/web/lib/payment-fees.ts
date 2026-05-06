import { calculateConfiguredManagerPaymentAmount } from "@/lib/manager-payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";

const CARD_FEE_RATE = 0.029;
const CARD_FEE_FIXED_CENTS = 30;
const ZERO_MANAGER_FEE = {
  feeCents: 0,
  managerProfileId: null
} as const;

interface ManagerFeeLookup {
  propertyId: string;
  rentAmountCents?: number;
}

interface ManagerPaymentConfigRow {
  property_id: string;
  manager_profile_id: string | null;
  payment_type: "percentage" | "flat";
  percentage_rate: number | null;
  flat_amount_cents: number | null;
  base_rent_cents: number | null;
  created_at: string;
}

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

export async function getManagerFeesForProperties(
  lookups: ManagerFeeLookup[]
): Promise<Map<string, { feeCents: number; managerProfileId: string | null }>> {
  const lookupEntries = Array.from(
    new Map(
      lookups
        .filter((lookup) => lookup.propertyId)
        .map((lookup) => [lookup.propertyId, lookup])
    ).values()
  );
  const propertyIds = lookupEntries.map((lookup) => lookup.propertyId);
  if (propertyIds.length === 0) {
    return new Map();
  }

  const rentAmountByPropertyId = new Map(
    lookupEntries.map((lookup) => [lookup.propertyId, lookup.rentAmountCents ?? 0])
  );
  const supabase = createAdminClient();
  const configQuery = await supabase
    .from("manager_payment_configs")
    .select("property_id, manager_profile_id, payment_type, percentage_rate, flat_amount_cents, base_rent_cents, created_at")
    .in("property_id", propertyIds)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (configQuery.error) {
    if (isMissingSchemaError(configQuery.error)) {
      return new Map();
    }
    throw configQuery.error;
  }

  const feesByPropertyId = new Map<string, { feeCents: number; managerProfileId: string | null }>();
  for (const config of (configQuery.data ?? []) as ManagerPaymentConfigRow[]) {
    if (feesByPropertyId.has(config.property_id)) {
      continue;
    }

    const feeCents = Math.max(
      calculateConfiguredManagerPaymentAmount({
        paymentType: config.payment_type,
        percentageRate: config.percentage_rate,
        flatAmountCents: config.flat_amount_cents,
        baseRentCents: config.base_rent_cents ?? rentAmountByPropertyId.get(config.property_id) ?? 0
      }),
      0
    );

    feesByPropertyId.set(config.property_id, {
      feeCents,
      managerProfileId: config.manager_profile_id ?? null
    });
  }

  return feesByPropertyId;
}

export async function getManagerFeeForProperty(
  propertyId: string,
  rentAmountCents: number
): Promise<{ feeCents: number; managerProfileId: string | null }> {
  const feesByPropertyId = await getManagerFeesForProperties([{ propertyId, rentAmountCents }]);
  return feesByPropertyId.get(propertyId) ?? ZERO_MANAGER_FEE;
}
