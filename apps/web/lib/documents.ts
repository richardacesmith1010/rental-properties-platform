import { createClient } from "@/lib/supabase/server";

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
}

export interface OwnerDocumentsData {
  templates: DocumentTemplateDTO[];
  packets: DocumentPacketDTO[];
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
}

export interface TenantDocumentsData {
  packets: TenantDocumentPacketDTO[];
}

export async function getOwnerDocumentsData(userId: string): Promise<OwnerDocumentsData> {
  const supabase = createClient();

  const { data: templates } = await supabase
    .from("document_templates")
    .select("id, name, category, body_markdown, created_at")
    .eq("owner_profile_id", userId)
    .order("created_at", { ascending: false });

  const templateRows = templates ?? [];

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("owner_profile_id", userId);

  const propertyRows = properties ?? [];
  const propertyIds = propertyRows.map((p) => p.id);

  if (propertyIds.length === 0) {
    return {
      templates: templateRows.map((template) => ({
        id: template.id,
        name: template.name,
        category: template.category,
        bodyMarkdown: template.body_markdown,
        createdAt: template.created_at
      })),
      packets: []
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
      signers: signerMap.get(packet.id) ?? []
    }))
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

  if (packetIds.length === 0) {
    return { packets: [] };
  }

  const { data: packets } = await supabase
    .from("document_packets")
    .select("id, template_id, property_id, status, created_at, sent_at, signed_at")
    .in("id", packetIds)
    .order("created_at", { ascending: false });

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

  return {
    packets: packetRows.map((packet) => ({
      id: packet.id,
      templateName: templateById.get(packet.template_id) ?? "Template",
      propertyLabel: propertyById.get(packet.property_id) ?? "Property",
      status: packet.status as TenantDocumentPacketDTO["status"],
      signerStatus: signerStatusByPacket.get(packet.id) ?? "pending",
      createdAt: packet.created_at,
      sentAt: packet.sent_at,
      signedAt: packet.signed_at
    }))
  };
}
