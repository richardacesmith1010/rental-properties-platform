import type { AppRole } from "@/lib/auth";

interface BaseAuthorizationInput {
  role: AppRole;
  userId: string;
  propertyOwnerId: string;
  isManagerAssigned: boolean;
}

export interface MaintenancePhotoAuthorizationInput extends BaseAuthorizationInput {
  ticketTenantId: string | null;
}

export interface DocumentPacketAuthorizationInput extends BaseAuthorizationInput {
  isSigner: boolean;
}

export function canAccessMaintenancePhoto(input: MaintenancePhotoAuthorizationInput): boolean {
  if (input.role === "owner") {
    return input.propertyOwnerId === input.userId;
  }

  if (input.role === "manager") {
    return input.isManagerAssigned;
  }

  return input.ticketTenantId === input.userId;
}

export function canAccessDocumentPacket(input: DocumentPacketAuthorizationInput): boolean {
  if (input.role === "owner") {
    return input.propertyOwnerId === input.userId;
  }

  if (input.role === "manager") {
    return input.isManagerAssigned;
  }

  return input.isSigner;
}
