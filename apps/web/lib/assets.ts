import type { AppRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerProperty } from "@/lib/property-access";
import {
  canAccessDocumentPacket,
  canAccessMaintenancePhoto,
} from "@/lib/asset-authorization";

const SIGNED_URL_TTL_SECONDS = 60 * 5;

export interface SignedAssetDTO {
  path: string;
  signedUrl: string;
  expiresAt: string;
}

export type SignedAssetResult =
  | { ok: true; asset: SignedAssetDTO }
  | { ok: false; status: 401 | 403 | 404 | 500; error: string };

function buildSignedAsset(path: string, signedUrl: string): SignedAssetDTO {
  return {
    path,
    signedUrl,
    expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  };
}

async function isManagerAssignedToProperty(
  userId: string,
  propertyId: string
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("property_managers")
    .select("property_id")
    .eq("property_id", propertyId)
    .eq("manager_profile_id", userId)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data?.property_id);
}

export async function getSignedMaintenancePhotoAsset(
  userId: string,
  role: AppRole,
  photoId: string
): Promise<SignedAssetResult> {
  try {
    const admin = createAdminClient();

    const { data: photo, error: photoError } = await admin
      .from("maintenance_photos")
      .select("id, ticket_id, storage_path")
      .eq("id", photoId)
      .single();

    if (photoError || !photo) {
      return { ok: false, status: 404, error: "Photo not found." };
    }

    const { data: ticket, error: ticketError } = await admin
      .from("maintenance_tickets")
      .select("id, property_id, tenant_profile_id")
      .eq("id", photo.ticket_id)
      .single();

    if (ticketError || !ticket) {
      return { ok: false, status: 404, error: "Ticket not found for photo." };
    }

    const { data: property, error: propertyError } = await admin
      .from("properties")
      .select("id")
      .eq("id", ticket.property_id)
      .single();

    if (propertyError || !property) {
      return { ok: false, status: 404, error: "Property not found for photo." };
    }

    const isManagerAssigned =
      role === "manager"
        ? await isManagerAssignedToProperty(userId, property.id)
        : false;
    const isPropertyAdmin = await canUserAdministerProperty(userId, property.id);

    if (
      !canAccessMaintenancePhoto({
        role,
        userId,
        isPropertyAdmin,
        isManagerAssigned,
        ticketTenantId: ticket.tenant_profile_id,
      })
    ) {
      return { ok: false, status: 403, error: "Forbidden." };
    }

    const { data: signed, error: signError } = await admin.storage
      .from("maintenance-photos")
      .createSignedUrl(photo.storage_path, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed?.signedUrl) {
      return {
        ok: false,
        status: 500,
        error: "Failed to create signed URL for maintenance photo.",
      };
    }

    return {
      ok: true,
      asset: buildSignedAsset(photo.storage_path, signed.signedUrl),
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error:
        error instanceof Error
          ? error.message
          : "Failed to access maintenance photo.",
    };
  }
}

export async function getSignedDocumentPacketAsset(
  userId: string,
  role: AppRole,
  packetId: string
): Promise<SignedAssetResult> {
  try {
    const admin = createAdminClient();

    const { data: packet, error: packetError } = await admin
      .from("document_packets")
      .select("id, property_id")
      .eq("id", packetId)
      .single();

    if (packetError || !packet) {
      return { ok: false, status: 404, error: "Document packet not found." };
    }

    const { data: property, error: propertyError } = await admin
      .from("properties")
      .select("id")
      .eq("id", packet.property_id)
      .single();

    if (propertyError || !property) {
      return {
        ok: false,
        status: 404,
        error: "Property not found for document packet.",
      };
    }

    const isManagerAssigned =
      role === "manager"
        ? await isManagerAssignedToProperty(userId, property.id)
        : false;
    const isPropertyAdmin = await canUserAdministerProperty(userId, property.id);

    let isSigner = false;
    if (role === "tenant") {
      const [{ data: byProfile }, { data: profile }] = await Promise.all([
        admin
          .from("document_signers")
          .select("id")
          .eq("packet_id", packetId)
          .eq("profile_id", userId)
          .maybeSingle(),
        admin
          .from("profiles")
          .select("email")
          .eq("id", userId)
          .single(),
      ]);

      if (byProfile?.id) {
        isSigner = true;
      } else if (profile?.email) {
        const { data: byEmail } = await admin
          .from("document_signers")
          .select("id")
          .eq("packet_id", packetId)
          .ilike("email", profile.email)
          .maybeSingle();

        isSigner = Boolean(byEmail?.id);
      }
    }

    if (
      !canAccessDocumentPacket({
        role,
        userId,
        isPropertyAdmin,
        isManagerAssigned,
        isSigner,
      })
    ) {
      return { ok: false, status: 403, error: "Forbidden." };
    }

    const { data: objects, error: listError } = await admin.storage
      .from("lease-documents")
      .list(packetId, {
        limit: 50,
        sortBy: { column: "created_at", order: "desc" },
      });

    if (listError) {
      return {
        ok: false,
        status: 500,
        error: "Failed to list document files for this packet.",
      };
    }

    const firstFile = (objects ?? []).find(
      (item) => typeof item.name === "string" && item.name.length > 0
    );

    if (!firstFile) {
      return {
        ok: false,
        status: 404,
        error: "No files uploaded for this document packet yet.",
      };
    }

    const path = `${packetId}/${firstFile.name}`;
    const { data: signed, error: signError } = await admin.storage
      .from("lease-documents")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed?.signedUrl) {
      return {
        ok: false,
        status: 500,
        error: "Failed to create signed URL for document file.",
      };
    }

    return {
      ok: true,
      asset: buildSignedAsset(path, signed.signedUrl),
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error:
        error instanceof Error
          ? error.message
          : "Failed to access document packet files.",
    };
  }
}
