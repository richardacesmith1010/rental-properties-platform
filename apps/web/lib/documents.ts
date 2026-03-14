import { createClient } from "@/lib/supabase/server";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  getAdministeredOwnerAccountIds,
  getAdministeredPropertyIds
} from "@/lib/property-access";

export interface SignerDTO {
  email: string;
  role: "owner" | "manager" | "tenant";
  status: "pending" | "signed";
  signedAt: string | null;
}

export interface DocumentTemplateDTO {
  id: string;
  name: string;
  category: string;
  bodyMarkdown: string;
  createdAt: string;
}

export interface DocumentPacketDTO {
  id: string;
  templateName: string;
  propertyLabel: string;
  status: "draft" | "sent" | "signed" | "void";
  createdAt: string;
  sentAt: string | null;
  signedAt: string | null;
  signers: SignerDTO[];
  isFeatureReady?: boolean;
  featureWarning?: string | null;
}

export interface PropertyFileDTO {
  id: string;
  propertyId: string;
  propertyLabel: string;
  fileName: string;
  fileType: string;
  category: "lease_agreement" | "inspection" | "insurance" | "tax" | "receipt" | "other";
  visibility: "owner_manager" | "all";
  description: string | null;
  createdAt: string;
}

export interface TenantSharedFileDTO {
  id: string;
  propertyLabel: string;
  fileName: string;
  fileType: string;
  category: "lease_agreement" | "inspection" | "insurance" | "tax" | "receipt" | "other";
  description: string | null;
  createdAt: string;
}

export interface OwnerDocumentsData {
  templates: DocumentTemplateDTO[];
  packets: DocumentPacketDTO[];
  propertyFiles: PropertyFileDTO[];
  propertyFilesEnabled: boolean;
  propertyFilesWarning: string | null;
}

export interface TenantDocumentPacketDTO {
  id: string;
  templateName: string;
  propertyLabel: string;
  status: "draft" | "sent" | "signed" | "void";
  signerStatus: "pending" | "signed";
  createdAt: string;
  sentAt: string | null;
  signedAt: string | null;
  isFeatureReady?: boolean;
  featureWarning?: string | null;
}

export interface TenantDocumentsData {
  packets: TenantDocumentPacketDTO[];
  files: TenantSharedFileDTO[];
  propertyFilesEnabled: boolean;
  propertyFilesWarning: string | null;
}

export async function getOwnerDocumentsData(userId: string): Promise<OwnerDocumentsData> {
  const supabase = createClient();
  const [ownerAccountIds, propertyIds] = await Promise.all([
    getAdministeredOwnerAccountIds(userId),
    getAdministeredPropertyIds(userId)
  ]);

  const modernTemplatesQuery = ownerAccountIds.length
    ? await supabase
        .from("document_templates")
        .select("id, name, category, body_markdown, created_at")
        .in("owner_account_id", ownerAccountIds)
        .order("created_at", { ascending: false })
    : { data: [] as Array<{
        id: string;
        name: string;
        category: string;
        body_markdown: string;
        created_at: string;
      }>, error: null };

  let templateRows: Array<{
    id: string;
    name: string;
    category: string;
    body_markdown: string;
    created_at: string;
  }> = [];

  if (!modernTemplatesQuery.error && ownerAccountIds.length > 0) {
    templateRows = modernTemplatesQuery.data ?? [];
  } else {
    const { data: legacyTemplates, error: legacyError } = await supabase
      .from("document_templates")
      .select("id, name, category, body_markdown, created_at")
      .eq("owner_profile_id", userId)
      .order("created_at", { ascending: false });

    if (legacyError && !isMissingSchemaError(legacyError)) {
      templateRows = [];
    } else {
      templateRows = legacyTemplates ?? [];
    }
  }

  const { data: properties } = propertyIds.length
    ? await supabase
        .from("properties")
        .select("id, name")
        .in("id", propertyIds)
    : { data: [] as Array<{ id: string; name: string }> };

  const propertyRows = properties ?? [];

  if (propertyIds.length === 0) {
    return {
      templates: templateRows.map((template) => ({
        id: template.id,
        name: template.name,
        category: template.category,
        bodyMarkdown: template.body_markdown,
        createdAt: template.created_at
      })),
      packets: [],
      propertyFiles: [],
      propertyFilesEnabled: true,
      propertyFilesWarning: null
    };
  }

  const { data: packets } = await supabase
    .from("document_packets")
    .select("id, template_id, property_id, unit_id, status, created_at, sent_at, signed_at")
    .in("property_id", propertyIds)
    .order("created_at", { ascending: false })
    .limit(50);

  const packetRows = packets ?? [];
  const packetIds = packetRows.map((packet) => packet.id);
  const templateById = new Map(templateRows.map((template) => [template.id, template]));
  const propertyById = new Map(propertyRows.map((property) => [property.id, property.name]));

  let signerMap = new Map<string, SignerDTO[]>();
  if (packetIds.length > 0) {
    const { data: signers } = await supabase
      .from("document_signers")
      .select("packet_id, email, role, status, signed_at")
      .in("packet_id", packetIds)
      .order("created_at", { ascending: true });

    for (const signer of signers ?? []) {
      const group = signerMap.get(signer.packet_id) ?? [];
      group.push({
        email: signer.email,
        role: signer.role as SignerDTO["role"],
        status: signer.status as SignerDTO["status"],
        signedAt: signer.signed_at
      });
      signerMap.set(signer.packet_id, group);
    }
  }

  let propertyFilesEnabled = true;
  let propertyFilesWarning: string | null = null;
  let propertyFileRows: Array<{
    id: string;
    property_id: string;
    file_name: string;
    file_type: string;
    category: PropertyFileDTO["category"];
    visibility: PropertyFileDTO["visibility"];
    description: string | null;
    created_at: string;
  }> = [];

  const { data: propertyFiles, error: propertyFilesError } = await supabase
    .from("property_files")
    .select("id, property_id, file_name, file_type, category, visibility, description, created_at")
    .in("property_id", propertyIds)
    .order("created_at", { ascending: false });

  if (propertyFilesError && isMissingSchemaError(propertyFilesError)) {
    propertyFilesEnabled = false;
    propertyFilesWarning =
      "Property file vault is not ready yet. Apply the Phase 3 migration to enable uploads and sharing.";
  } else if (!propertyFilesError) {
    propertyFileRows = propertyFiles ?? [];
  }

  return {
    templates: templateRows.map((template) => ({
      id: template.id,
      name: template.name,
      category: template.category,
      bodyMarkdown: template.body_markdown,
      createdAt: template.created_at
    })),
    packets: packetRows.map((packet) => ({
      id: packet.id,
      templateName: templateById.get(packet.template_id)?.name ?? "Template",
      propertyLabel: propertyById.get(packet.property_id) ?? "Property",
      status: packet.status as DocumentPacketDTO["status"],
      createdAt: packet.created_at,
      sentAt: packet.sent_at,
      signedAt: packet.signed_at,
      signers: signerMap.get(packet.id) ?? [],
      isFeatureReady: true,
      featureWarning: null
    })),
    propertyFiles: propertyFileRows.map((file) => ({
      id: file.id,
      propertyId: file.property_id,
      propertyLabel: propertyById.get(file.property_id) ?? "Property",
      fileName: file.file_name,
      fileType: file.file_type,
      category: file.category,
      visibility: file.visibility,
      description: file.description,
      createdAt: file.created_at
    })),
    propertyFilesEnabled,
    propertyFilesWarning
  };
}

export async function getTenantDocumentsData(userId: string): Promise<TenantDocumentsData> {
  const supabase = createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  const email = profile?.email ?? "";

  const [{ data: signersByProfile }, { data: signersByEmail }] = await Promise.all([
    supabase
      .from("document_signers")
      .select("packet_id, status")
      .eq("profile_id", userId),
    email
      ? supabase
          .from("document_signers")
          .select("packet_id, status")
          .eq("email", email)
      : Promise.resolve({ data: [] })
  ]);

  const signerRows = [...(signersByProfile ?? []), ...(signersByEmail ?? [])];
  const packetIds = Array.from(new Set(signerRows.map((s) => s.packet_id)));

  const { data: packets } = packetIds.length > 0
    ? await supabase
        .from("document_packets")
        .select("id, template_id, property_id, status, created_at, sent_at, signed_at")
        .in("id", packetIds)
        .order("created_at", { ascending: false })
    : { data: [] as Array<{
        id: string;
        template_id: string;
        property_id: string;
        status: string;
        created_at: string;
        sent_at: string | null;
        signed_at: string | null;
      }> };

  const packetRows = packets ?? [];
  const templateIds = Array.from(new Set(packetRows.map((packet) => packet.template_id)));
  const propertyIds = Array.from(new Set(packetRows.map((packet) => packet.property_id)));

  const [{ data: templates }, { data: properties }] = await Promise.all([
    templateIds.length > 0
      ? supabase
          .from("document_templates")
          .select("id, name")
          .in("id", templateIds)
      : Promise.resolve({ data: [] }),
    propertyIds.length > 0
      ? supabase
          .from("properties")
          .select("id, name")
          .in("id", propertyIds)
      : Promise.resolve({ data: [] })
  ]);

  const templateById = new Map((templates ?? []).map((template) => [template.id, template.name]));
  const propertyById = new Map((properties ?? []).map((property) => [property.id, property.name]));
  const signerStatusByPacket = new Map(signerRows.map((row) => [row.packet_id, row.status as "pending" | "signed"]));

  const { data: activeLeases } = await supabase
    .from("leases")
    .select("unit_id")
    .eq("tenant_profile_id", userId)
    .eq("active", true);

  const leaseUnitIds = (activeLeases ?? []).map((lease) => lease.unit_id);
  const { data: leaseUnits } = leaseUnitIds.length > 0
    ? await supabase
        .from("units")
        .select("id, property_id")
        .in("id", leaseUnitIds)
    : { data: [] as Array<{ id: string; property_id: string }> };

  const leasePropertyIds = Array.from(
    new Set((leaseUnits ?? []).map((unit) => unit.property_id))
  );

  let propertyFilesEnabled = true;
  let propertyFilesWarning: string | null = null;
  let tenantFileRows: Array<{
    id: string;
    property_id: string;
    file_name: string;
    file_type: string;
    category: TenantSharedFileDTO["category"];
    description: string | null;
    created_at: string;
  }> = [];

  if (leasePropertyIds.length > 0) {
    const { data: files, error: filesError } = await supabase
      .from("property_files")
      .select("id, property_id, file_name, file_type, category, description, created_at")
      .in("property_id", leasePropertyIds)
      .eq("visibility", "all")
      .order("created_at", { ascending: false });

    if (filesError && isMissingSchemaError(filesError)) {
      propertyFilesEnabled = false;
      propertyFilesWarning =
        "Shared property files are not ready yet. Ask your admin to complete the Phase 3 migration.";
    } else if (!filesError) {
      tenantFileRows = files ?? [];
    }
  }

  const combinedPropertyById = new Map<string, string>();
  for (const [id, name] of propertyById) {
    combinedPropertyById.set(id, name);
  }
  if (leasePropertyIds.length > 0) {
    const knownPropertyIds = new Set(combinedPropertyById.keys());
    const missingPropertyIds = leasePropertyIds.filter((id) => !knownPropertyIds.has(id));
    if (missingPropertyIds.length > 0) {
      const { data: extraProperties } = await supabase
        .from("properties")
        .select("id, name")
        .in("id", missingPropertyIds);

      for (const property of extraProperties ?? []) {
        combinedPropertyById.set(property.id, property.name);
      }
    }
  }

  return {
    packets: packetRows.map((packet) => ({
      id: packet.id,
      templateName: templateById.get(packet.template_id) ?? "Template",
      propertyLabel: propertyById.get(packet.property_id) ?? "Property",
      status: packet.status as TenantDocumentPacketDTO["status"],
      signerStatus: signerStatusByPacket.get(packet.id) ?? "pending",
      createdAt: packet.created_at,
      sentAt: packet.sent_at,
      signedAt: packet.signed_at,
      isFeatureReady: true,
      featureWarning: null
    })),
    files: tenantFileRows.map((file) => ({
      id: file.id,
      propertyLabel: combinedPropertyById.get(file.property_id) ?? "Property",
      fileName: file.file_name,
      fileType: file.file_type,
      category: file.category,
      description: file.description,
      createdAt: file.created_at
    })),
    propertyFilesEnabled,
    propertyFilesWarning
  };
}
