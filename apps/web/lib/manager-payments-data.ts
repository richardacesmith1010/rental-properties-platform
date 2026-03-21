import type { AppRole } from "@/lib/auth";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import {
  canUserAdministerProperty,
  getAdministeredProperties,
  getAdministeredPropertyIdsForAccount
} from "@/lib/property-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  calculateConfiguredManagerPaymentAmount,
  formatManagerPaymentCategory,
  generateInvoiceNumber,
  MANAGER_PAYMENTS_WARNING,
  type ManagerAssignmentOption,
  type ManagerInvoicePdfData,
  type ManagerPaymentCategory,
  type ManagerPaymentConfigDTO,
  type ManagerPaymentConfigType,
  type ManagerPaymentsDashboardData,
  type ManagerPaymentDTO,
  type ManagerPaymentStatus
} from "./manager-payments";

type PdfLookupResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 403 | 404; error: string };

interface PropertyRow {
  id: string;
  name: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  owner_profile_id: string | null;
}

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
}

interface ManagerPaymentConfigRow {
  id: string;
  property_id: string;
  manager_profile_id: string;
  payment_type: ManagerPaymentConfigType;
  percentage_rate: number | null;
  flat_amount_cents: number | null;
  base_rent_cents: number | null;
  label: string;
  frequency: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface ManagerPaymentRow {
  id: string;
  property_id: string;
  manager_profile_id: string;
  config_id: string | null;
  category: ManagerPaymentCategory;
  description: string;
  amount_cents: number;
  status: ManagerPaymentStatus;
  payment_date: string;
  paid_at: string | null;
  invoice_number: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

interface ManagerInvoiceShape {
  payment: ManagerPaymentRow;
  property: PropertyRow;
  managerProfile: ProfileRow | null;
  ownerProfile: ProfileRow | null;
  config: Pick<ManagerPaymentConfigRow, "label"> | null;
}

function buildPropertyAddress(
  property: Pick<PropertyRow, "address_line1" | "city" | "state" | "postal_code">
) {
  return [property.address_line1, property.city, property.state, property.postal_code]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(", ");
}

function getProfileName(profile: ProfileRow | null | undefined, fallback: string) {
  const fullName = profile?.full_name?.trim();
  if (fullName) {
    return fullName;
  }

  return profile?.email ?? fallback;
}

function formatManagerPaymentStatus(status: ManagerPaymentStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

async function getManagedPropertyRows(
  userId: string,
  accountId?: string | null
): Promise<PropertyRow[]> {
  const admin = createAdminClient();
  const propertyIds = accountId
    ? await getAdministeredPropertyIdsForAccount(userId, accountId)
    : (await getAdministeredProperties(userId)).map((property) => property.id);

  if (propertyIds.length === 0) {
    return [];
  }

  const { data: properties, error } = await admin
    .from("properties")
    .select("id, name, address_line1, city, state, postal_code, owner_profile_id")
    .in("id", propertyIds)
    .order("created_at", { ascending: true });

  if (error && isMissingSchemaError(error)) {
    return [];
  }

  return (properties ?? []) as PropertyRow[];
}

async function getManagerAssignments(propertyIds: string[]): Promise<Array<{ property_id: string; manager_profile_id: string }>> {
  if (propertyIds.length === 0) {
    return [];
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("property_managers")
    .select("property_id, manager_profile_id")
    .in("property_id", propertyIds)
    .eq("active", true);

  if (error && isMissingSchemaError(error)) {
    return [];
  }

  return data ?? [];
}

async function getProfiles(profileIds: string[]): Promise<Map<string, ProfileRow>> {
  if (profileIds.length === 0) {
    return new Map();
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .in("id", profileIds);

  return new Map(((data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
}

export async function getManagerPaymentsDashboardData(
  userId: string,
  accountId?: string | null
): Promise<ManagerPaymentsDashboardData> {
  const properties = await getManagedPropertyRows(userId, accountId);
  const propertyIds = properties.map((property) => property.id);
  const propertyMap = new Map(properties.map((property) => [property.id, property]));
  const assignments = await getManagerAssignments(propertyIds);
  const managerIds = Array.from(new Set(assignments.map((assignment) => assignment.manager_profile_id)));
  const managerMap = await getProfiles(managerIds);

  const managers = managerIds
    .map<ManagerAssignmentOption | null>((managerId) => {
      const profile = managerMap.get(managerId);
      if (!profile?.email) {
        return null;
      }

      const assignedProperties = assignments.filter(
        (assignment) => assignment.manager_profile_id === managerId
      );
      return {
        id: managerId,
        fullName: getProfileName(profile, profile.email),
        email: profile.email,
        propertyIds: assignedProperties.map((assignment) => assignment.property_id),
        propertyNames: assignedProperties
          .map((assignment) => propertyMap.get(assignment.property_id)?.name)
          .filter((name): name is string => Boolean(name))
      };
    })
    .filter((manager): manager is ManagerAssignmentOption => Boolean(manager))
    .sort((left, right) => left.fullName.localeCompare(right.fullName));

  if (propertyIds.length === 0) {
    return {
      configs: [],
      payments: [],
      managers,
      warning: null
    };
  }

  const admin = createAdminClient();
  const [{ data: configRows, error: configError }, { data: paymentRows, error: paymentError }] =
    await Promise.all([
      admin
        .from("manager_payment_configs")
        .select(
          "id, property_id, manager_profile_id, payment_type, percentage_rate, flat_amount_cents, base_rent_cents, label, frequency, active, created_at, updated_at"
        )
        .in("property_id", propertyIds)
        .order("created_at", { ascending: false }),
      admin
        .from("manager_payments")
        .select(
          "id, property_id, manager_profile_id, config_id, category, description, amount_cents, status, payment_date, paid_at, invoice_number, notes, created_by, created_at"
        )
        .in("property_id", propertyIds)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false })
    ]);

  const warning =
    (configError && isMissingSchemaError(configError)) ||
    (paymentError && isMissingSchemaError(paymentError))
      ? MANAGER_PAYMENTS_WARNING
      : null;

  const configs = (configError && isMissingSchemaError(configError) ? [] : (configRows ?? []))
    .map((config) => {
      const property = propertyMap.get(config.property_id);
      const manager = managerMap.get(config.manager_profile_id) ?? null;
      return {
        id: config.id,
        propertyId: config.property_id,
        propertyName: property?.name ?? "Unknown Property",
        propertyAddress: property ? buildPropertyAddress(property) || property.name : "Unknown Property",
        managerProfileId: config.manager_profile_id,
        managerName: getProfileName(manager, "Manager"),
        managerEmail: manager?.email ?? "Unknown",
        paymentType: config.payment_type,
        percentageRate: config.percentage_rate,
        flatAmountCents: config.flat_amount_cents,
        baseRentCents: config.base_rent_cents,
        label: config.label,
        frequency: config.frequency,
        active: config.active,
        calculatedAmountCents: calculateConfiguredManagerPaymentAmount({
          paymentType: config.payment_type,
          percentageRate: config.percentage_rate,
          flatAmountCents: config.flat_amount_cents,
          baseRentCents: config.base_rent_cents
        }),
        createdAt: config.created_at,
        updatedAt: config.updated_at
      } satisfies ManagerPaymentConfigDTO;
    })
    .sort((left, right) => {
      const propertyCompare = left.propertyName.localeCompare(right.propertyName);
      return propertyCompare !== 0 ? propertyCompare : left.managerName.localeCompare(right.managerName);
    });

  const payments = (paymentError && isMissingSchemaError(paymentError) ? [] : (paymentRows ?? []))
    .map((payment) => {
      const property = propertyMap.get(payment.property_id);
      const manager = managerMap.get(payment.manager_profile_id) ?? null;
      return {
        id: payment.id,
        propertyId: payment.property_id,
        propertyName: property?.name ?? "Unknown Property",
        propertyAddress: property ? buildPropertyAddress(property) || property.name : "Unknown Property",
        managerProfileId: payment.manager_profile_id,
        managerName: getProfileName(manager, "Manager"),
        managerEmail: manager?.email ?? "Unknown",
        category: payment.category,
        description: payment.description,
        amountCents: payment.amount_cents,
        status: payment.status,
        paymentDate: payment.payment_date,
        paidAt: payment.paid_at,
        invoiceNumber: payment.invoice_number,
        notes: payment.notes,
        configId: payment.config_id,
        createdAt: payment.created_at
      } satisfies ManagerPaymentDTO;
    });

  return {
    configs,
    payments,
    managers,
    warning
  };
}

async function fetchManagerInvoiceShape(paymentId: string): Promise<ManagerInvoiceShape | null> {
  const admin = createAdminClient();
  const { data: payment, error: paymentError } = await admin
    .from("manager_payments")
    .select(
      "id, property_id, manager_profile_id, config_id, category, description, amount_cents, status, payment_date, paid_at, invoice_number, notes, created_by, created_at"
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentError && isMissingSchemaError(paymentError)) {
    return null;
  }

  if (!payment) {
    return null;
  }

  const [{ data: property }, { data: config }] = await Promise.all([
    admin
      .from("properties")
      .select("id, name, address_line1, city, state, postal_code, owner_profile_id")
      .eq("id", payment.property_id)
      .maybeSingle(),
    payment.config_id
      ? admin
          .from("manager_payment_configs")
          .select("label")
          .eq("id", payment.config_id)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  if (!property) {
    return null;
  }

  const profiles = await getProfiles(
    [payment.manager_profile_id, property.owner_profile_id].filter(
      (value): value is string => Boolean(value)
    )
  );

  return {
    payment: payment as ManagerPaymentRow,
    property: property as PropertyRow,
    managerProfile: profiles.get(payment.manager_profile_id) ?? null,
    ownerProfile: property.owner_profile_id ? profiles.get(property.owner_profile_id) ?? null : null,
    config: config as Pick<ManagerPaymentConfigRow, "label"> | null
  };
}

export async function getManagerInvoicePdfData(params: {
  paymentId: string;
  userId: string;
  role: AppRole;
}): Promise<PdfLookupResult<ManagerInvoicePdfData>> {
  const shape = await fetchManagerInvoiceShape(params.paymentId);

  if (!shape) {
    return {
      ok: false,
      status: 404,
      error: "Manager payment invoice not found."
    };
  }

  const canView =
    params.userId === shape.payment.manager_profile_id ||
    (params.role === "owner" &&
      (await canUserAdministerProperty(params.userId, shape.payment.property_id)));

  if (!canView) {
    return {
      ok: false,
      status: 403,
      error: "You do not have access to this manager invoice."
    };
  }

  const invoiceNumber =
    shape.payment.invoice_number ??
    generateInvoiceNumber(shape.payment.id, new Date(shape.payment.created_at));

  return {
    ok: true,
    data: {
      invoiceNumber,
      invoiceDate: formatDate(shape.payment.payment_date),
      fromName: getProfileName(shape.ownerProfile, "Property Owner"),
      fromEmail: shape.ownerProfile?.email ?? "owner@domusbase.com",
      toName: getProfileName(shape.managerProfile, "Property Manager"),
      toEmail: shape.managerProfile?.email ?? "manager@domusbase.com",
      propertyName: shape.property.name,
      propertyAddress: buildPropertyAddress(shape.property) || shape.property.name,
      lineItems: [
        {
          description: shape.payment.description,
          amount: formatCurrency(shape.payment.amount_cents)
        }
      ],
      totalFormatted: formatCurrency(shape.payment.amount_cents),
      category: shape.config?.label ?? formatManagerPaymentCategory(shape.payment.category),
      status: formatManagerPaymentStatus(shape.payment.status),
      notes: shape.payment.notes,
      generatedAt: formatDateTime(new Date())
    }
  };
}

export async function getManagerPaymentEmailContext(paymentId: string) {
  const shape = await fetchManagerInvoiceShape(paymentId);
  if (!shape) {
    return null;
  }

  const invoiceNumber =
    shape.payment.invoice_number ??
    generateInvoiceNumber(shape.payment.id, new Date(shape.payment.created_at));
  const pdfData: ManagerInvoicePdfData = {
    invoiceNumber,
    invoiceDate: formatDate(shape.payment.payment_date),
    fromName: getProfileName(shape.ownerProfile, "Property Owner"),
    fromEmail: shape.ownerProfile?.email ?? "owner@domusbase.com",
    toName: getProfileName(shape.managerProfile, "Property Manager"),
    toEmail: shape.managerProfile?.email ?? "manager@domusbase.com",
    propertyName: shape.property.name,
    propertyAddress: buildPropertyAddress(shape.property) || shape.property.name,
    lineItems: [
      {
        description: shape.payment.description,
        amount: formatCurrency(shape.payment.amount_cents)
      }
    ],
    totalFormatted: formatCurrency(shape.payment.amount_cents),
    category: shape.config?.label ?? formatManagerPaymentCategory(shape.payment.category),
    status: formatManagerPaymentStatus(shape.payment.status),
    notes: shape.payment.notes,
    generatedAt: formatDateTime(new Date())
  };

  return {
    pdfData,
    propertyName: shape.property.name,
    propertyAddress: buildPropertyAddress(shape.property) || shape.property.name,
    ownerName: getProfileName(shape.ownerProfile, "Property Owner"),
    ownerEmail: shape.ownerProfile?.email,
    managerName: getProfileName(shape.managerProfile, "Property Manager"),
    managerEmail: shape.managerProfile?.email,
    paymentStatus: shape.payment.status,
    description: shape.payment.description,
    amountFormatted: formatCurrency(shape.payment.amount_cents),
    paymentDate: formatDate(shape.payment.payment_date),
    categoryLabel: shape.config?.label ?? formatManagerPaymentCategory(shape.payment.category)
  };
}
