"use server";

import { getFeatureCapabilities } from "@/lib/feature-capabilities";

export type ActionState =
  | { success: true; message?: string; joinCode?: string; accountId?: string; avatarUrl?: string }
  | { success: false; error: string }
  | null;

export type CapabilityKey =
  | "documentsEnabled"
  | "notificationsEnabled"
  | "vendorWorkflowEnabled"
  | "photoWorkflowEnabled"
  | "ownershipEnabled"
  | "leasingPipelineEnabled"
  | "inboxThreadsEnabled"
  | "automationsEnabled";

export async function isMissingSchemaError(error: unknown): Promise<boolean> {
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
    (message.includes("column") && message.includes("does not exist"))
  );
}

export async function ensureCapabilityEnabled(capability: CapabilityKey): Promise<ActionState> {
  const capabilities = await getFeatureCapabilities();
  if (capabilities[capability]) {
    return null;
  }

  if (capability === "documentsEnabled") {
    return {
      success: false,
      error:
        capabilities.warnings.documents ??
        "Documents are not available yet. Complete setup and retry."
    };
  }

  if (capability === "notificationsEnabled") {
    return {
      success: false,
      error:
        capabilities.warnings.notifications ??
        "Notifications are not available yet. Complete setup and retry."
    };
  }

  if (capability === "vendorWorkflowEnabled") {
    return {
      success: false,
      error:
        capabilities.warnings.vendorWorkflow ??
        "Vendor workflow is not available yet. Complete setup and retry."
    };
  }

  if (capability === "ownershipEnabled") {
    return {
      success: false,
      error:
        capabilities.warnings.ownership ??
        "Ownership accounts are not available yet. Complete setup and retry."
    };
  }

  if (capability === "leasingPipelineEnabled") {
    return {
      success: false,
      error:
        capabilities.warnings.leasingPipeline ??
        "Leasing pipeline is not available yet. Complete setup and retry."
    };
  }

  if (capability === "inboxThreadsEnabled") {
    return {
      success: false,
      error:
        capabilities.warnings.inboxThreads ??
        "Inbox threads are not available yet. Complete setup and retry."
    };
  }

  if (capability === "automationsEnabled") {
    return {
      success: false,
      error:
        capabilities.warnings.automations ??
        "Automation rules are not available yet. Complete setup and retry."
    };
  }

  return {
    success: false,
    error:
      capabilities.warnings.photoWorkflow ??
      "Photo workflow is not available yet. Complete setup and retry."
  };
}
