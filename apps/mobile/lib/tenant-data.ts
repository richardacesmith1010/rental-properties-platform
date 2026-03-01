import { getSupabaseClient } from "./supabase";
import type {
  MobileChargeDTO,
  MobileDocumentDTO,
  MobileTenantData,
  MobileTenantUnitDTO,
  MobileTicketDTO,
} from "./types";

function isMissingSchemaError(error: unknown): boolean {
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

export async function fetchMobileTenantData(userId: string): Promise<MobileTenantData> {
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
      charges: [],
      tickets: [],
      units: [],
      documents: [],
    };
  }

  const [{ data: units, error: unitError }, { data: charges, error: chargeError }] =
    await Promise.all([
      supabase
        .from("units")
        .select("id, unit_number, property_id")
        .in("id", unitIds),
      supabase
        .from("rent_charges")
        .select("id, lease_id, due_date, amount_cents, status")
        .in("lease_id", leaseIds)
        .in("status", ["pending", "late"])
        .order("due_date", { ascending: true }),
    ]);

  if (unitError) {
    throw unitError;
  }
  if (chargeError) {
    throw chargeError;
  }

  const propertyIds = Array.from(new Set((units ?? []).map((unit) => unit.property_id)));

  const { data: properties, error: propertyError } = propertyIds.length
    ? await supabase.from("properties").select("id, name").in("id", propertyIds)
    : { data: [], error: null };

  if (propertyError) {
    throw propertyError;
  }

  const propertyById = new Map((properties ?? []).map((property) => [property.id, property.name]));
  const leaseById = new Map(leaseRows.map((lease) => [lease.id, lease.unit_id]));
  const unitById = new Map((units ?? []).map((unit) => [unit.id, unit]));

  const mobileUnits: MobileTenantUnitDTO[] = (units ?? []).map((unit) => ({
    id: unit.id,
    propertyId: unit.property_id,
    propertyName: propertyById.get(unit.property_id) ?? "Property",
    unitNumber: unit.unit_number,
  }));

  const mobileCharges: MobileChargeDTO[] = (charges ?? []).map((charge) => {
    const unitId = leaseById.get(charge.lease_id);
    const unit = unitId ? unitById.get(unitId) : null;
    const propertyName = unit ? propertyById.get(unit.property_id) ?? "Your Rental" : "Your Rental";

    return {
      id: charge.id,
      propertyLabel: formatPropertyLabel(propertyName, unit?.unit_number ?? null),
      dueDate: charge.due_date,
      amountCents: charge.amount_cents,
      status: charge.status as "pending" | "late",
    };
  });

  const [{ data: tickets, error: ticketError }, documentsResult] = await Promise.all([
    supabase
      .from("maintenance_tickets")
      .select("id, property_id, unit_id, title, description, status, priority, created_at")
      .eq("tenant_profile_id", userId)
      .order("created_at", { ascending: false }),
    fetchTenantDocuments(userId),
  ]);

  if (ticketError) {
    throw ticketError;
  }

  const mobileTickets: MobileTicketDTO[] = (tickets ?? []).map((ticket) => {
    const unit = ticket.unit_id ? unitById.get(ticket.unit_id) : null;
    const propertyName = propertyById.get(ticket.property_id) ?? "Property";

    return {
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status as MobileTicketDTO["status"],
      priority: ticket.priority as MobileTicketDTO["priority"],
      createdAt: ticket.created_at,
      propertyName,
      unitNumber: unit?.unit_number ?? null,
    };
  });

  return {
    charges: mobileCharges,
    tickets: mobileTickets,
    units: mobileUnits,
    documents: documentsResult,
  };
}

export async function createTenantTicket(input: {
  userId: string;
  unitId: string;
  title: string;
  description: string;
  priority: MobileTicketDTO["priority"];
}) {
  const supabase = getSupabaseClient();

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("property_id")
    .eq("id", input.unitId)
    .single();

  if (unitError || !unit) {
    throw unitError ?? new Error("Unable to load selected unit.");
  }

  const { error } = await supabase.from("maintenance_tickets").insert({
    property_id: unit.property_id,
    unit_id: input.unitId,
    tenant_profile_id: input.userId,
    title: input.title,
    description: input.description,
    priority: input.priority,
    status: "open",
  });

  if (error) {
    throw error;
  }
}

async function fetchTenantDocuments(userId: string): Promise<MobileDocumentDTO[]> {
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
        .select("packet_id, status")
        .eq("profile_id", userId),
      email
        ? supabase
            .from("document_signers")
            .select("packet_id, status")
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
  const signerStatusByPacket = new Map(
    signerRows.map((row) => [row.packet_id, row.status as "pending" | "signed"])
  );

  return (packets ?? []).map((packet) => ({
    id: packet.id,
    templateName: templateById.get(packet.template_id) ?? "Document",
    propertyLabel: propertyById.get(packet.property_id) ?? "Property",
    packetStatus: packet.status as MobileDocumentDTO["packetStatus"],
    signerStatus: signerStatusByPacket.get(packet.id) ?? "pending",
    createdAt: packet.created_at,
    signedAt: packet.signed_at,
  }));
}
