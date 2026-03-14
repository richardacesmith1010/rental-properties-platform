"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { awardXp, XP_VALUES } from "@/lib/gamification";
import { shouldThrottleDocumentPacketSend } from "@/lib/idempotency";
import { sideEffectError } from "@/lib/logger";
import {
  createNotificationWithDelivery,
  notifyOwnerMembersForProperty
} from "@/lib/notifications";
import { canUserAdministerProperty } from "@/lib/property-access";
import {
  createDocumentPacketSchema,
  sendDocumentPacketSchema,
  signDocumentPacketSchema,
  parseFormData
} from "@/lib/validations";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireAuth } from "./auth-helpers";
import { ensureCapabilityEnabled, type ActionState } from "./shared";

function isRateLimited(userId: string, action: string, maxRequests = 30, windowMs = 60_000) {
  const result = checkRateLimit(`${action}:${userId}`, maxRequests, windowMs);
  return result.allowed ? null : { success: false, error: "Too many requests. Please try again later." };
}

export async function createDocumentPacket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager");
  const limited = isRateLimited(user.id, "createDocumentPacket");
  if (limited) return limited;

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) return capabilityError;

  const parsed = parseFormData(createDocumentPacketSchema, formData);
  if (!parsed.success) return parsed;

  const { templateId, leaseId } = parsed.data;
  const [{ data: template }, { data: lease }] = await Promise.all([
    supabase.from("document_templates").select("id, owner_account_id").eq("id", templateId).single(),
    supabase.from("leases").select("id, unit_id").eq("id", leaseId).single()
  ]);

  if (!template) return { success: false, error: "Template not found." };
  if (!lease) return { success: false, error: "Lease not found." };

  const { data: unit } = await supabase.from("units").select("id, property_id").eq("id", lease.unit_id).single();
  if (!unit) return { success: false, error: "Unit not found for lease." };

  const { data: property } = await supabase.from("properties").select("id, owner_account_id").eq("id", unit.property_id).single();
  if (!property) return { success: false, error: "Property not found for lease." };
  if (!(await canUserAdministerProperty(user.id, property.id))) return { success: false, error: "You do not have access to this lease." };
  if (template.owner_account_id !== property.owner_account_id) return { success: false, error: "Template account does not match this property account." };

  const { error } = await supabase.from("document_packets").insert({
    template_id: templateId,
    property_id: property.id,
    unit_id: unit.id,
    lease_id: lease.id,
    status: "draft",
    created_by_profile_id: user.id
  });
  if (error) return { success: false, error: "Failed to create document packet." };

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}

export async function sendDocumentPacket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner", "manager");
  const limited = isRateLimited(user.id, "sendDocumentPacket", 10, 60_000);
  if (limited) return limited;

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) return capabilityError;

  const parsed = parseFormData(sendDocumentPacketSchema, formData);
  if (!parsed.success) return parsed;

  const admin = createAdminClient();
  const { data: packet } = await supabase
    .from("document_packets")
    .select("id, lease_id, property_id, status, sent_at, template_id")
    .eq("id", parsed.data.packetId)
    .single();

  if (!packet) return { success: false, error: "Document packet not found." };
  if (!(await canUserAdministerProperty(user.id, packet.property_id))) return { success: false, error: "You do not have access to this packet." };
  if (packet.status === "signed" || packet.status === "void") return { success: false, error: "This packet can no longer be sent." };
  if (packet.status === "sent" && shouldThrottleDocumentPacketSend(packet.sent_at)) return { success: true };
  if (!packet.lease_id) return { success: false, error: "Packet must be linked to a lease before sending." };

  const { data: lease } = await admin.from("leases").select("id, tenant_profile_id").eq("id", packet.lease_id).single();
  if (!lease?.tenant_profile_id) return { success: false, error: "No tenant linked to this lease." };

  const { data: tenantProfile } = await admin.from("profiles").select("id, email").eq("id", lease.tenant_profile_id).single();
  if (!tenantProfile?.email) return { success: false, error: "Tenant email is missing for this lease." };

  const { data: template } = packet.template_id
    ? await admin.from("document_templates").select("name").eq("id", packet.template_id).maybeSingle()
    : { data: null };
  const packetTitle = template?.name ?? "Lease document";

  const { error: signerError } = await admin.from("document_signers").upsert(
    { packet_id: packet.id, profile_id: tenantProfile.id, email: tenantProfile.email, role: "tenant", status: "pending" },
    { onConflict: "packet_id,email" }
  );
  if (signerError) return { success: false, error: "Failed to set packet signer." };

  const { error: packetError } = await supabase
    .from("document_packets")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", packet.id);
  if (packetError) return { success: false, error: "Failed to send packet." };

  void createNotificationWithDelivery({
    recipientProfileId: tenantProfile.id,
    recipientEmail: tenantProfile.email,
    type: "document_sent",
    title: "Document Ready for Signature",
    body: `You have a new document "${packetTitle}" to review and sign.`,
    entityType: "document_packet",
    entityId: packet.id
  }).catch(sideEffectError("sendDocumentPacket", "notify_signer", { userId: user.id, entityType: "document_packet", entityId: packet.id }));

  void notifyOwnerMembersForProperty({
    propertyId: packet.property_id,
    type: "document_sent",
    title: "Document packet sent",
    body: `"${packetTitle}" was sent to the tenant for signature.`,
    entityType: "document_packet",
    entityId: packet.id,
    excludeProfileId: user.id
  }).catch(sideEffectError("sendDocumentPacket", "notify_signer", { userId: user.id, entityType: "document_packet", entityId: packet.id }));

  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
  return { success: true };
}

export async function signDocumentPacket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager", "tenant");
  const limited = isRateLimited(user.id, "signDocumentPacket", 20, 60_000);
  if (limited) return limited;

  const capabilityError = await ensureCapabilityEnabled("documentsEnabled");
  if (capabilityError) return capabilityError;

  const parsed = parseFormData(signDocumentPacketSchema, formData);
  if (!parsed.success) return parsed;

  const { packetId, signatureText } = parsed.data;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("email").eq("id", user.id).single();
  const email = profile?.email ?? "";
  const requestHeaders = headers();
  const ipAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? requestHeaders.get("x-real-ip") ?? null;
  const userAgent = requestHeaders.get("user-agent");

  const [{ data: signerByProfile }, { data: signerByEmail }] = await Promise.all([
    admin.from("document_signers").select("id, status").eq("packet_id", packetId).eq("profile_id", user.id).maybeSingle(),
    email
      ? admin.from("document_signers").select("id, status").eq("packet_id", packetId).eq("email", email).maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  const signer = signerByProfile ?? signerByEmail;
  if (!signer) return { success: false, error: "Signer record not found for this document." };
  if (signer.status === "signed") return { success: false, error: "This document is already signed." };

  const signedAt = new Date().toISOString();
  const { error: signerError } = await admin.from("document_signers").update({
    profile_id: user.id,
    status: "signed",
    signature_text: signatureText,
    signed_at: signedAt,
    ip_address: ipAddress,
    user_agent: userAgent
  }).eq("id", signer.id);
  if (signerError) return { success: false, error: "Failed to sign document." };

  const { data: remaining } = await admin.from("document_signers").select("id").eq("packet_id", packetId).eq("status", "pending").limit(1);
  if (!remaining || remaining.length === 0) {
    const { error: packetUpdateError } = await admin.from("document_packets").update({ status: "signed", signed_at: signedAt }).eq("id", packetId);
    if (packetUpdateError) return { success: false, error: "Document signed, but the packet could not be finalized." };

    const { data: packet } = await admin.from("document_packets").select("id, property_id, template_id").eq("id", packetId).single();
    if (packet?.property_id) {
      const { data: template } = packet.template_id
        ? await admin.from("document_templates").select("name").eq("id", packet.template_id).maybeSingle()
        : { data: null };

      void notifyOwnerMembersForProperty({
        propertyId: packet.property_id,
        type: "document_signed",
        title: "Document Signed",
        body: `"${template?.name ?? "Lease document"}" has been signed.`,
        entityType: "document_packet",
        entityId: packet.id
      }).catch(sideEffectError("signDocumentPacket", "notify_signer", { userId: user.id, entityType: "document_packet", entityId: packet.id }));
    }
  }

  void awardXp(user.id, "document_signed", XP_VALUES.document_signed, "Document signed successfully.", {
    packet_id: packetId,
    signer_id: signer.id
  }).catch(sideEffectError("signDocumentPacket", "award_xp", { userId: user.id, entityType: "xp_event", entityId: packetId }));

  revalidatePath("/tenant");
  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true };
}
