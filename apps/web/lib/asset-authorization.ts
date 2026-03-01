import type { AppRole } from "@/lib/auth";

interface BaseAuthorizationInput {
  role: AppRole;
  userId: string;
  isPropertyAdmin: boolean;
  isManagerAssigned: boolean;
  propertyOwnerId?: string;
}

export interface MaintenancePhotoAuthorizationInput extends BaseAuthorizationInput {
  ticketTenantId: string | null;
}

export interface DocumentPacketAuthorizationInput extends BaseAuthorizationInput {
  isSigner: boolean;
}

export function canAccessMaintenancePhoto(input: MaintenancePhotoAuthorizationInput): boolean {
  if (input.role === "owner") {
    return Boolean(input.isPropertyAdmin || input.propertyOwnerId === input.userId);
  }

  if (input.role === "manager") {
    return Boolean(input.isManagerAssigned || input.isPropertyAdmin);
  }

  return input.ticketTenantId === input.userId;
}

export function canAccessDocumentPacket(input: DocumentPacketAuthorizationInput): boolean {
  if (input.role === "owner") {
    return Boolean(input.isPropertyAdmin || input.propertyOwnerId === input.userId);
  }

  if (input.role === "manager") {
    return Boolean(input.isManagerAssigned || input.isPropertyAdmin);
  }

  return input.isSigner;
}
