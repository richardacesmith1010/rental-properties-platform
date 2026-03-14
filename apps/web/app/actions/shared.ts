import { getFeatureCapabilities } from "@/lib/feature-capabilities";
export { isMissingSchemaError } from "@/lib/supabase-errors";

export type ActionState =
  | {
      success: true;
      message?: string;
      joinCode?: string;
      accountId?: string;
      unitId?: string;
      avatarUrl?: string;
      url?: string;
      connected?: boolean;
      detailsSubmitted?: boolean;
    }
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

const capabilityWarningMap: Record<
  CapabilityKey,
  keyof Awaited<ReturnType<typeof getFeatureCapabilities>>["warnings"]
> = {
  documentsEnabled: "documents",
  notificationsEnabled: "notifications",
  vendorWorkflowEnabled: "vendorWorkflow",
  photoWorkflowEnabled: "photoWorkflow",
  ownershipEnabled: "ownership",
  leasingPipelineEnabled: "leasingPipeline",
  inboxThreadsEnabled: "inboxThreads",
  automationsEnabled: "automations"
};

export async function ensureCapabilityEnabled(capability: CapabilityKey): Promise<ActionState> {
  const capabilities = await getFeatureCapabilities();
  if (capabilities[capability]) {
    return null;
  }

  const warningKey = capabilityWarningMap[capability];
  return {
    success: false,
    error:
      capabilities.warnings[warningKey] ?? `${warningKey} is not available yet. Complete setup and retry.`
  };
}
