import type { PostgrestError } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeChargeCategory,
  withChargeEditingFallback,
  type ChargeStatus
} from "@/lib/charge-audit";
import type { PropertyFileDTO } from "@/lib/documents";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import type {
  PropertyActivityRecord,
  PropertyChargeRecord,
  PropertyDocumentRecord,
  PropertyPaymentRecord
} from "@/lib/property-detail-types";

type AdminClient = ReturnType<typeof createAdminClient>;

function normalizeChargeStatus(
  value: string | null | undefined
): ChargeStatus {
  switch (value) {
    case "paid":
    case "late":
    case "waived":
      return value;
    case "pending":
    default:
      return "pending";
  }
}

function normalizeDocumentCategory(
  value: string | null | undefined
): PropertyFileDTO["category"] {
  switch (value) {
    case "lease_agreement":
    case "inspection":
    case "insurance":
    case "tax":
    case "receipt":
      return value;
    case "other":
    default:
      return "other";
  }
}

function normalizeDocumentVisibility(
  value: string | null | undefined
): PropertyFileDTO["visibility"] {
  return value === "all" ? "all" : "owner_manager";
}

export async function getPropertyChargeData(
  admin: AdminClient,
  propertyId: string
): Promise<{
  charges: PropertyChargeRecord[];
  payments: PropertyPaymentRecord[];
}> {
  const { data: units, error: unitsError } = await admin
    .from("units")
    .select("id, unit_number")
    .eq("property_id", propertyId);

  if (unitsError) {
    if (isMissingSchemaError(unitsError)) {
      return { charges: [], payments: [] };
    }
    throw unitsError;
  }

  const unitRows = (units ?? []) as Array<{
    id: string;
    unit_number: string;
  }>;
  if (unitRows.length === 0) {
    return { charges: [], payments: [] };
  }

  const unitIds = unitRows.map((unit) => unit.id);
  const { data: leases, error: leasesError } = await admin
    .from("leases")
    .select("id, unit_id, tenant_profile_id")
    .in("unit_id", unitIds);

  if (leasesError) {
    if (isMissingSchemaError(leasesError)) {
      return { charges: [], payments: [] };
    }
    throw leasesError;
  }

  const leaseRows = (leases ?? []) as Array<{
    id: string;
    unit_id: string;
    tenant_profile_id: string | null;
  }>;
  if (leaseRows.length === 0) {
    return { charges: [], payments: [] };
  }

  const leaseIds = leaseRows.map((lease) => lease.id);
  const tenantIds = Array.from(
    new Set(
      leaseRows
        .map((lease) => lease.tenant_profile_id)
        .filter((tenantId): tenantId is string => Boolean(tenantId))
    )
  );

  const [{ data: tenants, error: tenantsError }, chargeResult] =
    await Promise.all([
      tenantIds.length > 0
        ? admin.from("profiles").select("id, full_name, email").in("id", tenantIds)
        : Promise.resolve({
            data: [] as Array<{
              id: string;
              full_name: string | null;
              email: string | null;
            }>,
            error: null
          }),
      withChargeEditingFallback(
        () =>
          admin
            .from("rent_charges")
            .select("id, lease_id, due_date, amount_cents, status, category")
            .in("lease_id", leaseIds)
            .is("deleted_at", null)
            .order("due_date", { ascending: false }),
        () =>
          admin
            .from("rent_charges")
            .select("id, lease_id, due_date, amount_cents, status, category")
            .in("lease_id", leaseIds)
            .order("due_date", { ascending: false })
      )
    ]);

  if (tenantsError) {
    if (isMissingSchemaError(tenantsError)) {
      return { charges: [], payments: [] };
    }
    throw tenantsError;
  }

  if (chargeResult.error) {
    if (isMissingSchemaError(chargeResult.error)) {
      return { charges: [], payments: [] };
    }
    throw chargeResult.error;
  }

  const chargeRows = (chargeResult.data ?? []) as Array<{
    id: string;
    lease_id: string;
    due_date: string;
    amount_cents: number;
    status: string | null;
    category: string | null;
  }>;
  if (chargeRows.length === 0) {
    return { charges: [], payments: [] };
  }

  const chargeIds = chargeRows.map((charge) => charge.id);
  const { data: payments, error: paymentsError } = await admin
    .from("payments")
    .select("id, rent_charge_id, paid_at, amount_cents, method")
    .in("rent_charge_id", chargeIds)
    .order("paid_at", { ascending: false });

  if (paymentsError) {
    if (isMissingSchemaError(paymentsError)) {
      return { charges: [], payments: [] };
    }
    throw paymentsError;
  }

  const paymentRows = (payments ?? []) as Array<{
    id: string;
    rent_charge_id: string;
    paid_at: string;
    amount_cents: number;
    method: string;
  }>;
  const unitById = new Map(unitRows.map((unit) => [unit.id, unit]));
  const leaseById = new Map(leaseRows.map((lease) => [lease.id, lease]));
  const chargeById = new Map(chargeRows.map((charge) => [charge.id, charge]));
  const tenantNameById = new Map(
    (tenants ?? []).map((tenant) => [
      tenant.id,
      tenant.full_name?.trim() || tenant.email || "Unknown tenant"
    ])
  );
  const latestPaymentByChargeId = new Map<string, string>();

  for (const payment of paymentRows) {
    if (!latestPaymentByChargeId.has(payment.rent_charge_id)) {
      latestPaymentByChargeId.set(payment.rent_charge_id, payment.paid_at);
    }
  }

  return {
    charges: chargeRows.map((charge) => {
      const lease = leaseById.get(charge.lease_id);
      const unit = lease ? unitById.get(lease.unit_id) : null;

      return {
        id: charge.id,
        leaseId: charge.lease_id,
        propertyId,
        tenantProfileId: lease?.tenant_profile_id ?? null,
        tenantName: lease?.tenant_profile_id
          ? tenantNameById.get(lease.tenant_profile_id) ?? "Unknown tenant"
          : "No tenant",
        unitNumber: unit?.unit_number ?? "-",
        category: normalizeChargeCategory(charge.category),
        amountCents: charge.amount_cents,
        dueDate: charge.due_date,
        status: normalizeChargeStatus(charge.status),
        paymentDate: latestPaymentByChargeId.get(charge.id) ?? null
      };
    }),
    payments: paymentRows
      .map((payment) => {
        const charge = chargeById.get(payment.rent_charge_id);
        if (!charge) {
          return null;
        }

        const lease = leaseById.get(charge.lease_id);
        const unit = lease ? unitById.get(lease.unit_id) : null;

        return {
          id: payment.id,
          chargeId: payment.rent_charge_id,
          propertyId,
          tenantProfileId: lease?.tenant_profile_id ?? null,
          tenantName: lease?.tenant_profile_id
            ? tenantNameById.get(lease.tenant_profile_id) ?? "Unknown tenant"
            : "No tenant",
          unitNumber: unit?.unit_number ?? "-",
          amountCents: payment.amount_cents,
          paidAt: payment.paid_at,
          method: payment.method
        };
      })
      .filter(
        (payment): payment is PropertyPaymentRecord => payment !== null
      )
  };
}

export async function getPropertyDocumentData(
  admin: AdminClient,
  propertyId: string
): Promise<{
  files: PropertyDocumentRecord[];
  propertyFilesEnabled: boolean;
  propertyFilesWarning: string | null;
}> {
  const fullSelect =
    "id, property_id, file_name, file_type, category, visibility, description, created_at, uploaded_by_profile_id";
  const fallbackSelect =
    "id, property_id, file_name, file_type, category, visibility, description, created_at";

  const fullQuery = await admin
    .from("property_files")
    .select(fullSelect)
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });

  let propertyFilesEnabled = true;
  let propertyFilesWarning: string | null = null;
  let fileRows: Array<{
    id: string;
    property_id: string;
    file_name: string;
    file_type: string;
    category: string | null;
    visibility: string | null;
    description: string | null;
    created_at: string;
    uploaded_by_profile_id: string | null;
  }> = [];

  if (fullQuery.error) {
    if (!isMissingSchemaError(fullQuery.error)) {
      throw fullQuery.error;
    }

    const fallbackQuery = await admin
      .from("property_files")
      .select(fallbackSelect)
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });

    if (fallbackQuery.error) {
      if (!isMissingSchemaError(fallbackQuery.error)) {
        throw fallbackQuery.error;
      }

      propertyFilesEnabled = false;
      propertyFilesWarning = "This feature requires a database update.";
    } else {
      fileRows = (fallbackQuery.data ?? []).map((file) => ({
        ...file,
        uploaded_by_profile_id: null
      }));
    }
  } else {
    fileRows = (fullQuery.data ?? []).map((file) => ({
      ...file,
      uploaded_by_profile_id: file.uploaded_by_profile_id ?? null
    }));
  }

  const uploaderIds = Array.from(
    new Set(
      fileRows
        .map((file) => file.uploaded_by_profile_id)
        .filter((uploaderId): uploaderId is string => Boolean(uploaderId))
    )
  );
  let uploaders: Array<{
    id: string;
    full_name: string | null;
    email: string | null;
  }> = [];
  let uploadersError: PostgrestError | null = null;

  if (uploaderIds.length > 0) {
    const profilesQuery = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", uploaderIds);
    uploaders = profilesQuery.data ?? [];
    uploadersError = profilesQuery.error;
  }

  if (uploadersError && !isMissingSchemaError(uploadersError)) {
    throw uploadersError;
  }

  const uploaderNameById = new Map(
    (uploaders ?? []).map((profile) => [
      profile.id,
      profile.full_name?.trim() || profile.email || "Domus User"
    ])
  );

  return {
    files: fileRows.map((file) => ({
      id: file.id,
      propertyId: file.property_id,
      propertyLabel: "Property",
      fileName: file.file_name,
      fileType: file.file_type,
      category: normalizeDocumentCategory(file.category),
      visibility: normalizeDocumentVisibility(file.visibility),
      description: file.description,
      createdAt: file.created_at,
      uploaderName: file.uploaded_by_profile_id
        ? uploaderNameById.get(file.uploaded_by_profile_id) ?? "Domus User"
        : "Domus User"
    })),
    propertyFilesEnabled,
    propertyFilesWarning
  };
}

export async function getPropertyActivityData(
  admin: AdminClient,
  propertyId: string
): Promise<PropertyActivityRecord[]> {
  const { data: entries, error } = await admin
    .from("tenant_activity_log")
    .select(
      "id, tenant_profile_id, property_id, unit_id, lease_id, activity_type, title, description, created_by, created_at"
    )
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }
    throw error;
  }

  const activityRows = (entries ?? []) as Array<{
    id: string;
    tenant_profile_id: string;
    property_id: string;
    unit_id: string | null;
    lease_id: string | null;
    activity_type: PropertyActivityRecord["activityType"];
    title: string;
    description: string | null;
    created_by: string;
    created_at: string;
  }>;
  if (activityRows.length === 0) {
    return [];
  }

  const profileIds = Array.from(
    new Set(
      activityRows.flatMap((entry) => [entry.tenant_profile_id, entry.created_by])
    )
  );
  const unitIds = Array.from(
    new Set(
      activityRows
        .map((entry) => entry.unit_id)
        .filter((unitId): unitId is string => Boolean(unitId))
    )
  );

  const [{ data: profiles, error: profilesError }, { data: units, error: unitsError }] =
    await Promise.all([
      admin.from("profiles").select("id, full_name, email").in("id", profileIds),
      unitIds.length > 0
        ? admin.from("units").select("id, unit_number").in("id", unitIds)
        : Promise.resolve({
            data: [] as Array<{ id: string; unit_number: string }>,
            error: null
          })
    ]);

  if (profilesError) {
    if (isMissingSchemaError(profilesError)) {
      return [];
    }
    throw profilesError;
  }

  if (unitsError && !isMissingSchemaError(unitsError)) {
    throw unitsError;
  }

  const profileNameById = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      profile.full_name?.trim() || profile.email || "Unknown"
    ])
  );
  const unitNumberById = new Map(
    (units ?? []).map((unit) => [unit.id, unit.unit_number])
  );

  return activityRows.map((entry) => ({
    id: entry.id,
    tenantProfileId: entry.tenant_profile_id,
    tenantName:
      profileNameById.get(entry.tenant_profile_id) ?? "Unknown tenant",
    propertyId: entry.property_id,
    unitId: entry.unit_id,
    unitNumber: entry.unit_id ? unitNumberById.get(entry.unit_id) ?? null : null,
    leaseId: entry.lease_id,
    activityType: entry.activity_type,
    title: entry.title,
    description: entry.description ?? "",
    createdAt: entry.created_at,
    createdBy: entry.created_by,
    authorName: profileNameById.get(entry.created_by) ?? "Unknown"
  }));
}
