import type { ManagerWorkflowMode } from "./dashboard-config";

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
  tenants: "daily_ops",
  leasing: "new_tenant",
  invitations: "new_tenant",
  documents: "new_tenant",
  vendors: "vendor_ops"
};
