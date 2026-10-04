import { useCallback } from "react";
import type { ManagerWorkflowMode } from "./dashboard-config";

interface DashboardWorkflowHandlerParams {
  isOwnerRole: boolean;
  isManagerRole: boolean;
  managerWorkflowMode: ManagerWorkflowMode;
  goToSectionIfVisible: (sectionId: string) => void;
}

export function useDashboardWorkflowHandlers({
  goToSectionIfVisible,
  isManagerRole,
  isOwnerRole,
  managerWorkflowMode
}: DashboardWorkflowHandlerParams) {
  const handlePropertyCreated = useCallback(() => {
    if (
      isOwnerRole ||
      (isManagerRole && managerWorkflowMode === "new_property")
    ) {
      goToSectionIfVisible("portfolio");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode]);

  const handleUnitCreated = useCallback(() => {
    if (
      isOwnerRole ||
      (isManagerRole && managerWorkflowMode === "new_property")
    ) {
      goToSectionIfVisible("units");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode]);

  const handleLeaseCreated = useCallback(() => {
    if (
      isOwnerRole ||
      (isManagerRole && managerWorkflowMode === "new_property")
    ) {
      goToSectionIfVisible("leases");
      return;
    }
    if (
      (isManagerRole && managerWorkflowMode === "new_tenant")
    ) {
      goToSectionIfVisible("documents");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode]);

  const handleTenantInviteSuccess = useCallback(() => {
    if (isOwnerRole) { goToSectionIfVisible("invitations"); return; }
    if (
      (isManagerRole && managerWorkflowMode === "new_tenant")
    ) {
      goToSectionIfVisible("leasing");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode]);

  const handleManagerInviteSuccess = useCallback(() => {}, []);

  const handleOwnerInviteSuccess = useCallback(() => {
    if (isOwnerRole) {
      goToSectionIfVisible("ownership");
    }
  }, [goToSectionIfVisible, isOwnerRole]);

  const handleVendorCreatedSuccess = useCallback(() => {
    if (
      (isManagerRole && managerWorkflowMode === "vendor_ops")
    ) {
      goToSectionIfVisible("maintenance");
    }
  }, [goToSectionIfVisible, isManagerRole, managerWorkflowMode]);

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
