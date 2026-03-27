import type { ManagerWorkflowMode, OwnerWorkflowMode } from "./dashboard-config";

export const OWNER_SECTION_MODE_BY_ID: Partial<Record<string, OwnerWorkflowMode>> = {
  charges: "daily_ops",
  payments: "records",
  maintenance: "daily_ops",
  applications: "new_tenant",
  inbox: "new_manager",
  automations: "new_manager",
  notifications: "records",
  activity: "records",
  expenses: "records",
  analytics: "daily_ops",
  operations: "new_property",
  portfolio: "daily_ops",
  units: "records",
  leases: "daily_ops",
  "manager-payments": "daily_ops",
  members: "daily_ops",
  leasing: "new_tenant",
  invitations: "new_tenant",
  vendors: "new_manager",
  documents: "records",
  ownership: "records"
};

export const MANAGER_SECTION_MODE_BY_ID: Partial<Record<string, ManagerWorkflowMode>> = {
  charges: "daily_ops",
  payments: "daily_ops",
  maintenance: "daily_ops",
  applications: "daily_ops",
  inbox: "daily_ops",
  automations: "daily_ops",
  notifications: "daily_ops",
  activity: "daily_ops",
  expenses: "daily_ops",
  analytics: "daily_ops",
  operations: "new_property",
  portfolio: "new_property",
  units: "new_property",
  leases: "new_property",
  leasing: "new_tenant",
  invitations: "new_tenant",
  documents: "new_tenant",
  vendors: "vendor_ops"
};
