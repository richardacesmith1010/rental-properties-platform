import { getSupabaseClient } from "./supabase";
import type {
  MobileChargeDTO,
  MobileDocumentDTO,
  MobilePaymentDTO,
  MobileTenantData,
  MobileTenantUnitDTO,
  MobileTicketDTO,
} from "./types";

interface LeaseContext {
  leaseRows: Array<{ id: string; unit_id: string }>;
  leaseIds: string[];
  unitRows: Array<{ id: string; unit_number: string; property_id: string }>;
  unitById: Map<string, { id: string; unit_number: string; property_id: string }>;
  leaseById: Map<string, string>;
  propertyById: Map<string, string>;
}

export function isMissingSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String(error.code ?? "") : "";
  const message = "message" in error ? String(error.message ?? "").toLowerCase() : "";

  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table")
  );
}

function formatPropertyLabel(propertyName: string | null, unitNumber: string | null) {
  if (!propertyName) {
    return "Your Rental";
  }

  if (!unitNumber) {
    return propertyName;
  }

  return `${propertyName} • Unit ${unitNumber}`;
}

async function fetchActiveTenantLeaseContext(userId: string): Promise<LeaseContext> {
  const supabase = getSupabaseClient();

  const { data: leases, error: leaseError } = await supabase
    .from("leases")
    .select("id, unit_id")
    .eq("tenant_profile_id", userId)
    .eq("active", true);

  if (leaseError) {
    throw leaseError;
  }

  const leaseRows = leases ?? [];
  const leaseIds = leaseRows.map((lease) => lease.id);
  const unitIds = Array.from(new Set(leaseRows.map((lease) => lease.unit_id)));

  if (leaseIds.length === 0 || unitIds.length === 0) {
    return {
      leaseRows,
      leaseIds,
      unitRows: [],
      unitById: new Map(),
      leaseById: new Map(),
      propertyById: new Map()
    };
  }

  const { data: units, error: unitError } = await supabase
    .from("units")
    .select("id, unit_number, property_id")
    .in("id", unitIds);

  if (unitError) {
    throw unitError;
  }

  const unitRows = units ?? [];
  const propertyIds = Array.from(new Set(unitRows.map((unit) => unit.property_id)));

  const { data: properties, error: propertyError } = propertyIds.length
    ? await supabase.from("properties").select("id, name").in("id", propertyIds)
    : { data: [], error: null };

  if (propertyError) {
    throw propertyError;
  }

  return {
    leaseRows,
    leaseIds,
    unitRows,
    unitById: new Map(unitRows.map((unit) => [unit.id, unit])),
    leaseById: new Map(leaseRows.map((lease) => [lease.id, lease.unit_id])),
    propertyById: new Map((properties ?? []).map((property) => [property.id, property.name]))
  };
}

export async function fetchTenantUnits(userId: string): Promise<MobileTenantUnitDTO[]> {
  const context = await fetchActiveTenantLeaseContext(userId);
  return context.unitRows.map((unit) => ({
    id: unit.id,
    propertyId: unit.property_id,
    propertyName: context.propertyById.get(unit.property_id) ?? "Property",
    unitNumber: unit.unit_number
  }));
}

export async function fetchTenantCharges(userId: string): Promise<MobileChargeDTO[]> {
  const supabase = getSupabaseClient();
  const context = await fetchActiveTenantLeaseContext(userId);

  if (context.leaseIds.length === 0) {
    return [];
  }

  const { data: charges, error: chargeError } = await supabase
    .from("rent_charges")
    .select("id, lease_id, due_date, amount_cents, status")
    .in("lease_id", context.leaseIds)
    .in("status", ["pending", "late"])
    .order("due_date", { ascending: true });

  if (chargeError) {
    throw chargeError;
  }

  return (charges ?? []).map((charge) => {
    const unitId = context.leaseById.get(charge.lease_id);
    const unit = unitId ? context.unitById.get(unitId) : null;
    const propertyName = unit ? context.propertyById.get(unit.property_id) ?? "Your Rental" : "Your Rental";

    return {
      id: charge.id,
      propertyLabel: formatPropertyLabel(propertyName, unit?.unit_number ?? null),
      dueDate: charge.due_date,
      amountCents: charge.amount_cents,
      status: charge.status as "pending" | "late"
    };
  });
}

export async function fetchTenantPayments(userId: string): Promise<MobilePaymentDTO[]> {
  const supabase = getSupabaseClient();
  const context = await fetchActiveTenantLeaseContext(userId);

  if (context.leaseIds.length === 0) {
    return [];
  }

  const { data: charges, error: chargesError } = await supabase
    .from("rent_charges")
    .select("id")
    .in("lease_id", context.leaseIds);

  if (chargesError) {
    if (isMissingSchemaError(chargesError)) {
      return [];
    }
    throw chargesError;
  }

  const chargeIds = (charges ?? []).map((charge) => charge.id);
  if (chargeIds.length === 0) {
    return [];
  }

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("id, amount_cents, paid_at, method")
    .in("rent_charge_id", chargeIds)
    .order("paid_at", { ascending: false })
    .limit(50);

  if (paymentsError) {
    if (isMissingSchemaError(paymentsError)) {
      return [];
    }
    throw paymentsError;
  }

  return (payments ?? []).map((payment) => ({
    id: payment.id,
    amountCents: payment.amount_cents,
    paidAt: payment.paid_at,
    method: payment.method
  }));
}

export async function fetchTenantTickets(userId: string): Promise<MobileTicketDTO[]> {
  const supabase = getSupabaseClient();

  const { data: tickets, error: ticketError } = await supabase
    .from("maintenance_tickets")
    .select("id, property_id, unit_id, title, description, status, priority, created_at")
    .eq("tenant_profile_id", userId)
    .order("created_at", { ascending: false });

  if (ticketError) {
    throw ticketError;
  }

  const ticketRows = tickets ?? [];
  if (ticketRows.length === 0) {
    return [];
  }

  const propertyIds = Array.from(new Set(ticketRows.map((ticket) => ticket.property_id)));
  const unitIds = Array.from(
    new Set(ticketRows.map((ticket) => ticket.unit_id).filter((unitId): unitId is string => Boolean(unitId)))
  );

  const [{ data: properties }, { data: units }, photosResult] = await Promise.all([
    propertyIds.length
      ? supabase.from("properties").select("id, name").in("id", propertyIds)
      : Promise.resolve({ data: [] }),
    unitIds.length
      ? supabase.from("units").select("id, unit_number").in("id", unitIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("maintenance_photos")
      .select("id, ticket_id")
      .in("ticket_id", ticketRows.map((ticket) => ticket.id))
  ]);

  const propertyById = new Map((properties ?? []).map((property) => [property.id, property.name]));
  const unitById = new Map((units ?? []).map((unit) => [unit.id, unit.unit_number]));
  const photoCountByTicketId = new Map<string, number>();

  if (!photosResult.error) {
    for (const photo of photosResult.data ?? []) {
      photoCountByTicketId.set(
        photo.ticket_id,
        (photoCountByTicketId.get(photo.ticket_id) ?? 0) + 1
      );
    }
  } else if (!isMissingSchemaError(photosResult.error)) {
    throw photosResult.error;
  }

  return ticketRows.map((ticket) => ({
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status as MobileTicketDTO["status"],
    priority: ticket.priority as MobileTicketDTO["priority"],
    createdAt: ticket.created_at,
    propertyName: propertyById.get(ticket.property_id) ?? "Property",
    unitNumber: ticket.unit_id ? unitById.get(ticket.unit_id) ?? null : null,
    photoCount: photoCountByTicketId.get(ticket.id) ?? 0
  }));
}

export async function fetchTenantDocuments(userId: string): Promise<MobileDocumentDTO[]> {
  const supabase = getSupabaseClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  if (profileError && !isMissingSchemaError(profileError)) {
    throw profileError;
  }

  const email = profile?.email ?? "";

  const [{ data: signersByProfile, error: signerProfileError }, signersByEmailResult] =
    await Promise.all([
      supabase
        .from("document_signers")
        .select("id, packet_id, status")
        .eq("profile_id", userId),
      email
        ? supabase
            .from("document_signers")
            .select("id, packet_id, status")
            .eq("email", email)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (signerProfileError) {
    if (isMissingSchemaError(signerProfileError)) {
      return [];
    }
    throw signerProfileError;
  }

  if (signersByEmailResult.error) {
    if (isMissingSchemaError(signersByEmailResult.error)) {
      return [];
    }
    throw signersByEmailResult.error;
  }

  const signerRows = [...(signersByProfile ?? []), ...(signersByEmailResult.data ?? [])];
  const packetIds = Array.from(new Set(signerRows.map((row) => row.packet_id)));

  if (packetIds.length === 0) {
    return [];
  }

  const { data: packets, error: packetError } = await supabase
    .from("document_packets")
    .select("id, template_id, property_id, status, created_at, signed_at")
    .in("id", packetIds)
    .order("created_at", { ascending: false });

  if (packetError) {
    if (isMissingSchemaError(packetError)) {
      return [];
    }
    throw packetError;
  }

  const templateIds = Array.from(new Set((packets ?? []).map((packet) => packet.template_id)));
  const propertyIds = Array.from(new Set((packets ?? []).map((packet) => packet.property_id)));

  const [{ data: templates }, { data: properties }] = await Promise.all([
    templateIds.length
      ? supabase.from("document_templates").select("id, name").in("id", templateIds)
      : Promise.resolve({ data: [] }),
    propertyIds.length
      ? supabase.from("properties").select("id, name").in("id", propertyIds)
      : Promise.resolve({ data: [] }),
  ]);

  const templateById = new Map((templates ?? []).map((template) => [template.id, template.name]));
  const propertyById = new Map((properties ?? []).map((property) => [property.id, property.name]));
  const signerByPacketId = new Map<
    string,
    { id: string; status: "pending" | "signed" }
  >();

  for (const row of signerRows) {
    const normalizedStatus = row.status as "pending" | "signed";
    const existing = signerByPacketId.get(row.packet_id);

    if (!existing) {
      signerByPacketId.set(row.packet_id, {
        id: row.id,
        status: normalizedStatus
      });
      continue;
    }

    if (existing.status === "signed" && normalizedStatus === "pending") {
      signerByPacketId.set(row.packet_id, {
        id: row.id,
        status: normalizedStatus
      });
    }
  }

  return (packets ?? []).map((packet) => ({
    id: packet.id,
    templateName: templateById.get(packet.template_id) ?? "Document",
    propertyLabel: propertyById.get(packet.property_id) ?? "Property",
    packetStatus: packet.status as MobileDocumentDTO["packetStatus"],
    signerStatus: signerByPacketId.get(packet.id)?.status ?? "pending",
    signerId: signerByPacketId.get(packet.id)?.id ?? null,
    createdAt: packet.created_at,
    signedAt: packet.signed_at,
  }));
}

export async function fetchMobileTenantData(userId: string): Promise<MobileTenantData> {
  const [charges, payments, tickets, units, documents] = await Promise.all([
    fetchTenantCharges(userId),
    fetchTenantPayments(userId),
    fetchTenantTickets(userId),
    fetchTenantUnits(userId),
    fetchTenantDocuments(userId)
  ]);

  return {
    charges,
    payments,
    tickets,
    units,
    documents
  };
}

export async function createTenantTicket(input: {
  userId: string;
  unitId: string;
  title: string;
  description: string;
  priority: MobileTicketDTO["priority"];
}): Promise<string> {
  const supabase = getSupabaseClient();

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("property_id")
    .eq("id", input.unitId)
    .single();

  if (unitError || !unit) {
    throw unitError ?? new Error("Unable to load selected unit.");
  }

  const { data: insertedTicket, error } = await supabase
    .from("maintenance_tickets")
    .insert({
      property_id: unit.property_id,
      unit_id: input.unitId,
      tenant_profile_id: input.userId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: "open",
    })
    .select("id")
    .single();

  if (error || !insertedTicket) {
    throw error ?? new Error("Unable to create ticket.");
  }

  return insertedTicket.id;
}
