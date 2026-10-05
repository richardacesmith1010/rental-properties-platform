import { useCallback } from "react";

interface DashboardWorkflowHandlerParams {
  isOwnerRole: boolean;
  isManagerRole: boolean;
  goToSectionIfVisible: (sectionId: string) => void;
}

export function useDashboardWorkflowHandlers({
  goToSectionIfVisible,
  isManagerRole,
  isOwnerRole,
}: DashboardWorkflowHandlerParams) {
  const handlePropertyCreated = useCallback(() => {
    if (
      isOwnerRole ||
      isManagerRole
    ) {
      goToSectionIfVisible("portfolio");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole]);

  const handleUnitCreated = useCallback(() => {
    if (
      isOwnerRole ||
      isManagerRole
    ) {
      goToSectionIfVisible("units");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole]);

  const handleLeaseCreated = useCallback(() => {
    if (isOwnerRole || isManagerRole) {
      goToSectionIfVisible("leases");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole]);

  const handleTenantInviteSuccess = useCallback(() => {
    if (isOwnerRole) { goToSectionIfVisible("invitations"); return; }
    if (
      isManagerRole
    ) {
      goToSectionIfVisible("leasing");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole]);

  const handleManagerInviteSuccess = useCallback(() => {}, []);

  const handleOwnerInviteSuccess = useCallback(() => {
    if (isOwnerRole) {
      goToSectionIfVisible("ownership");
    }
  }, [goToSectionIfVisible, isOwnerRole]);

  const handleVendorCreatedSuccess = useCallback(() => {
    if (
      isManagerRole
    ) {
      goToSectionIfVisible("maintenance");
    }
  }, [goToSectionIfVisible, isManagerRole]);

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
