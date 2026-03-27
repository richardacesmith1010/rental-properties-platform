import { useCallback } from "react";
import type { ManagerWorkflowMode, OwnerWorkflowMode } from "./dashboard-config";

interface DashboardWorkflowHandlerParams {
  isOwnerRole: boolean;
  isManagerRole: boolean;
  ownerWorkflowMode: OwnerWorkflowMode;
  managerWorkflowMode: ManagerWorkflowMode;
  goToSectionIfVisible: (sectionId: string) => void;
}

export function useDashboardWorkflowHandlers({
  goToSectionIfVisible,
  isManagerRole,
  isOwnerRole,
  managerWorkflowMode,
  ownerWorkflowMode
}: DashboardWorkflowHandlerParams) {
  const handlePropertyCreated = useCallback(() => {
    if (
      (isOwnerRole && ownerWorkflowMode === "new_property") ||
      (isManagerRole && managerWorkflowMode === "new_property")
    ) {
      goToSectionIfVisible("portfolio");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode, ownerWorkflowMode]);

  const handleUnitCreated = useCallback(() => {
    if (
      (isOwnerRole && ownerWorkflowMode === "new_property") ||
      (isManagerRole && managerWorkflowMode === "new_property")
    ) {
      goToSectionIfVisible("units");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode, ownerWorkflowMode]);

  const handleLeaseCreated = useCallback(() => {
    if (
      (isOwnerRole && ownerWorkflowMode === "new_property") ||
      (isManagerRole && managerWorkflowMode === "new_property")
    ) {
      goToSectionIfVisible("leases");
      return;
    }
    if (
      (isOwnerRole && ownerWorkflowMode === "new_tenant") ||
      (isManagerRole && managerWorkflowMode === "new_tenant")
    ) {
      goToSectionIfVisible("documents");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode, ownerWorkflowMode]);

  const handleTenantInviteSuccess = useCallback(() => {
    if (
      (isOwnerRole && ownerWorkflowMode === "new_tenant") ||
      (isManagerRole && managerWorkflowMode === "new_tenant")
    ) {
      goToSectionIfVisible("leasing");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode, ownerWorkflowMode]);

  const handleManagerInviteSuccess = useCallback(() => {
    if (isOwnerRole && ownerWorkflowMode === "new_manager") {
      goToSectionIfVisible("vendors");
    }
  }, [goToSectionIfVisible, isOwnerRole, ownerWorkflowMode]);

  const handleOwnerInviteSuccess = useCallback(() => {
    if (isOwnerRole) {
      goToSectionIfVisible("ownership");
    }
  }, [goToSectionIfVisible, isOwnerRole]);

  const handleVendorCreatedSuccess = useCallback(() => {
    if (
      (isOwnerRole && ownerWorkflowMode === "new_manager") ||
      (isManagerRole && managerWorkflowMode === "vendor_ops")
    ) {
      goToSectionIfVisible("maintenance");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode, ownerWorkflowMode]);

  return {
    handlePropertyCreated,
    handleUnitCreated,
    handleLeaseCreated,
    handleTenantInviteSuccess,
    handleManagerInviteSuccess,
    handleOwnerInviteSuccess,
    handleVendorCreatedSuccess
  };
}
