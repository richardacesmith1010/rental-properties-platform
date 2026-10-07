import type { AppRole } from "@/lib/auth";
import { withChargeEditingFallback } from "@/lib/charge-audit";
import { canUserAdministerProperty, getAdministeredPropertyIds } from "@/lib/property-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildLeaseSummaryPdfData, buildReceiptPdfData } from "./pdf-builders";
import type { LeaseQueryShape, ReceiptQueryShape, LeaseSummaryPdfData, ReceiptPdfData } from "./pdf-builders";

export {
  buildLeaseSummaryFileName, buildLeaseSummaryPdfData, buildReceiptFileName,
  buildReceiptNumber, buildReceiptPdfData, buildReceiptsExportFileName
} from "./pdf-builders";
export type { LeaseSummaryPdfData, ReceiptPdfData } from "./pdf-builders";

type PdfLookupResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 403 | 404; error: string };

async function fetchReceiptShape(chargeId: string): Promise<ReceiptQueryShape | null> {
  const admin = createAdminClient();
  const chargeQuery = await withChargeEditingFallback(
    () =>
      admin
        .from("rent_charges")
        .select("id, lease_id, due_date, amount_cents, category")
        .eq("id", chargeId)
        .is("deleted_at", null)
        .maybeSingle(),
    () =>
      admin
        .from("rent_charges")
        .select("id, lease_id, due_date, amount_cents, category")
        .eq("id", chargeId)
        .maybeSingle()
  );
  const charge = chargeQuery.data;

  if (!charge) {
    return null;
  }

  const [{ data: lease }, { data: payment }] = await Promise.all([
    admin
      .from("leases")
      .select(
        "id, tenant_profile_id, unit_id, start_date, end_date, monthly_rent_cents, deposit_cents, \
due_day_of_month, late_fee_cents, grace_period_days, lease_status"
      )
      .eq("id", charge.lease_id)
      .maybeSingle(),
    admin
      .from("payments")
      .select("id, paid_at, amount_cents, method, reference_note")
      .eq("rent_charge_id", charge.id)
      .order("paid_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (!lease || !payment) {
    return null;
  }

  const [{ data: unit }, { data: tenantProfile }] = await Promise.all([
    admin
      .from("units")
      .select("id, unit_number, property_id")
      .eq("id", lease.unit_id)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", lease.tenant_profile_id)
      .maybeSingle()
  ]);

  if (!unit) {
    return null;
  }

  const { data: property } = await admin
    .from("properties")
    .select("id, name, address_line1, city, state, postal_code")
    .eq("id", unit.property_id)
    .maybeSingle();

  if (!property) {
    return null;
  }

  return {
    charge,
    payment,
    lease,
    unit,
    property,
    tenantProfile
  };
}

async function fetchLeaseShape(leaseId: string): Promise<LeaseQueryShape | null> {
  const admin = createAdminClient();
  const { data: lease } = await admin
    .from("leases")
    .select(
      "id, tenant_profile_id, unit_id, start_date, end_date, monthly_rent_cents, deposit_cents, \
due_day_of_month, late_fee_cents, grace_period_days, lease_status"
    )
    .eq("id", leaseId)
    .maybeSingle();

  if (!lease) {
    return null;
  }

  const [{ data: unit }, { data: tenantProfile }] = await Promise.all([
    admin
      .from("units")
      .select("id, unit_number, property_id")
      .eq("id", lease.unit_id)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", lease.tenant_profile_id)
      .maybeSingle()
  ]);

  if (!unit) {
    return null;
  }

  const { data: property } = await admin
    .from("properties")
    .select("id, name, address_line1, city, state, postal_code")
    .eq("id", unit.property_id)
    .maybeSingle();

  if (!property) {
    return null;
  }

  return {
    lease,
    unit,
    property,
    tenantProfile
  };
}

export async function getReceiptPdfData(
  userId: string,
  role: AppRole,
  chargeId: string
): Promise<PdfLookupResult<ReceiptPdfData>> {
  const shape = await fetchReceiptShape(chargeId);
  if (!shape) {
    return { ok: false, status: 404, error: "Receipt not found." };
  }

  const canAccess =
    role === "tenant"
      ? shape.lease.tenant_profile_id === userId
      : await canUserAdministerProperty(userId, shape.property.id);

  if (!canAccess) {
    return { ok: false, status: 403, error: "Forbidden." };
  }

  return { ok: true, data: buildReceiptPdfData(shape) };
}

export async function getLeaseSummaryPdfData(
  userId: string,
  role: AppRole,
  leaseId: string
): Promise<PdfLookupResult<LeaseSummaryPdfData>> {
  const shape = await fetchLeaseShape(leaseId);
  if (!shape) {
    return { ok: false, status: 404, error: "Lease not found." };
  }

  const canAccess =
    role === "tenant"
      ? shape.lease.tenant_profile_id === userId
      : await canUserAdministerProperty(userId, shape.property.id);

  if (!canAccess) {
    return { ok: false, status: 403, error: "Forbidden." };
  }

  return { ok: true, data: buildLeaseSummaryPdfData(shape) };
}

export async function getReceiptsPdfDataForYear(
  userId: string,
  role: AppRole,
  year: number
): Promise<PdfLookupResult<ReceiptPdfData[]>> {
  if (role !== "owner" && role !== "manager") {
    return { ok: false, status: 403, error: "Forbidden." };
  }

  const propertyIds = await getAdministeredPropertyIds(userId);
  if (propertyIds.length === 0) {
    return { ok: true, data: [] };
  }

  const admin = createAdminClient();
  const { data: properties } = await admin
    .from("properties")
    .select("id, name, address_line1, city, state, postal_code")
    .in("id", propertyIds);

  const propertyRows =
    (properties ?? []) as Array<{
      id: string;
      name: string;
      address_line1: string | null;
      city: string | null;
      state: string | null;
      postal_code: string | null;
    }>;
  if (propertyRows.length === 0) {
    return { ok: true, data: [] };
  }

  const { data: units } = await admin
    .from("units")
    .select("id, unit_number, property_id")
    .in("property_id", propertyIds);

  const unitRows = (units ?? []) as Array<{ id: string; unit_number: string; property_id: string }>;
  if (unitRows.length === 0) {
    return { ok: true, data: [] };
  }

  const unitIds = unitRows.map((unit) => unit.id);
  const { data: leases } = await admin
    .from("leases")
    .select(
      "id, tenant_profile_id, unit_id, start_date, end_date, monthly_rent_cents, deposit_cents, \
due_day_of_month, late_fee_cents, grace_period_days, lease_status"
    )
    .in("unit_id", unitIds);

  const leaseRows =
    (leases ?? []) as Array<{
      id: string;
      tenant_profile_id: string;
      unit_id: string;
      start_date: string;
      end_date: string;
      monthly_rent_cents: number;
      deposit_cents: number;
      due_day_of_month: number;
      late_fee_cents: number | null;
      grace_period_days: number | null;
      lease_status: string | null;
    }>;
  if (leaseRows.length === 0) {
    return { ok: true, data: [] };
  }

  const leaseIds = leaseRows.map((lease) => lease.id);
  const { data: charges } = await withChargeEditingFallback(
    () =>
      admin
        .from("rent_charges")
        .select("id, lease_id, due_date, amount_cents, category")
        .in("lease_id", leaseIds)
        .is("deleted_at", null),
    () =>
      admin
        .from("rent_charges")
        .select("id, lease_id, due_date, amount_cents, category")
        .in("lease_id", leaseIds)
  );

  const chargeRows =
    (charges ?? []) as Array<{
      id: string;
      lease_id: string;
      due_date: string;
      amount_cents: number;
      category: string | null;
    }>;
  if (chargeRows.length === 0) {
    return { ok: true, data: [] };
  }

  const chargeIds = chargeRows.map((charge) => charge.id);
  const startIso = `${year}-01-01T00:00:00.000Z`;
  const endIso = `${year + 1}-01-01T00:00:00.000Z`;
  const { data: payments } = await admin
    .from("payments")
    .select("id, rent_charge_id, paid_at, amount_cents, method, reference_note")
    .in("rent_charge_id", chargeIds)
    .gte("paid_at", startIso)
    .lt("paid_at", endIso)
    .order("paid_at", { ascending: false });

  const paymentRows =
    (payments ?? []) as Array<{
      id: string;
      rent_charge_id: string;
      paid_at: string;
      amount_cents: number;
      method: string;
      reference_note: string | null;
    }>;
  if (paymentRows.length === 0) {
    return { ok: true, data: [] };
  }

  const tenantIds = Array.from(
    new Set(leaseRows.map((lease) => lease.tenant_profile_id).filter((id): id is string => Boolean(id)))
  );
  const { data: profiles } = tenantIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", tenantIds)
    : { data: [] as Array<{ id: string; full_name: string | null; email: string | null }> };

  const propertyById = new Map(propertyRows.map((property) => [property.id, property]));
  const unitById = new Map(unitRows.map((unit) => [unit.id, unit]));
  const leaseById = new Map(leaseRows.map((lease) => [lease.id, lease]));
  const chargeById = new Map(chargeRows.map((charge) => [charge.id, charge]));
  const profileById = new Map(
    ((profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map((profile) => [profile.id, profile])
  );

  const receipts = paymentRows
    .map((payment) => {
      const charge = chargeById.get(payment.rent_charge_id);
      if (!charge) {
        return null;
      }

      const lease = leaseById.get(charge.lease_id);
      if (!lease) {
        return null;
      }

      const unit = unitById.get(lease.unit_id);
      if (!unit) {
        return null;
      }

      const property = propertyById.get(unit.property_id);
      if (!property) {
        return null;
      }

      return buildReceiptPdfData({
        charge,
        payment: {
          id: payment.id,
          paid_at: payment.paid_at,
          amount_cents: payment.amount_cents,
          method: payment.method,
          reference_note: payment.reference_note
        },
        lease,
        unit,
        property,
        tenantProfile: profileById.get(lease.tenant_profile_id) ?? null
      });
    })
    .filter((receipt): receipt is ReceiptPdfData => receipt !== null);

  return { ok: true, data: receipts };
}
