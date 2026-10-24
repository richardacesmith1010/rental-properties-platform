import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/logger", () => ({ sideEffectError: vi.fn() }));

import { classifyWipeRpcError, createWipePlan, validateWipeRpcResult } from "../account-wipe/mutations";

describe("account wipe plan", () => {
  it("A5 skips empty deleteIn and updateIn but keeps an empty deleteWhere in filter", () => {
    const plan = createWipePlan();
    plan.deleteIn("payments", "id", [], "Delete payments");
    plan.updateIn("units", { occupied: false }, "id", [], "Reset occupied units");
    plan.deleteWhere("invitations", [{ op: "in", column: "property_id", values: [] }], "Delete invitations");
    expect(plan.ops).toEqual([{
      table: "invitations", kind: "delete", label: "Delete invitations",
      filters: [{ op: "in", column: "property_id", values: [] }]
    }]);
  });
  it("A5 maps not-null and unit occupancy to the exact RPC payload", () => {
    const plan = createWipePlan();
    plan.deleteWhere("maintenance_tickets", [
      { op: "in", column: "property_id", values: ["property-1"] },
      { op: "not_null", column: "tenant_profile_id" }
    ], "Delete tenant maintenance tickets");
    plan.updateIn("units", { occupied: false }, "id", ["unit-1"], "Reset unit occupancy");
    expect(plan.ops).toEqual([
      {
        table: "maintenance_tickets", kind: "delete", label: "Delete tenant maintenance tickets",
        filters: [
          { op: "in", column: "property_id", values: ["property-1"] },
          { op: "not_null", column: "tenant_profile_id" }
        ]
      },
      {
        table: "units", kind: "update", set: { occupied: false }, label: "Reset unit occupancy",
        filters: [{ op: "in", column: "id", values: ["unit-1"] }]
      }
    ]);
  });
  it.each([
    ["22P02", "database_rollback_confirmed"], ["42501", "database_rollback_confirmed"],
    ["57014", "database_rollback_confirmed"], ["P0001", "database_rollback_confirmed"],
    ["PGRST202", "database_rollback_confirmed"], ["PGRST203", "database_rollback_confirmed"],
    ["08006", "rpc_result_unknown"], ["57P01", "rpc_result_unknown"],
    ["PGRST000", "rpc_result_unknown"], ["PGRST003", "rpc_result_unknown"],
    ["", "rpc_result_unknown"], [undefined, "rpc_result_unknown"]
  ])("A2d classifies %s as %s", (code, category) => {
    expect(classifyWipeRpcError({ code })).toBe(category);
  });
  it("S6 accepts any well-shaped skip and rejects mixed rows", () => {
    const plan = createWipePlan();
    plan.deleteIn("vendors", "id", ["vendor-1"], "Delete vendors");
    plan.deleteIn("properties", "id", ["property-1"], "Delete properties");
    expect(validateWipeRpcResult({
      operations: 2,
      results: [{ label: "Delete vendors", skipped: true }, { label: "Delete properties", rows: 0 }]
    }, plan.ops)).toBe(true);
    expect(validateWipeRpcResult({
      operations: 2,
      results: [{ label: "Delete vendors", rows: 0 }, { label: "Delete properties", skipped: true }]
    }, plan.ops)).toBe(true);
    expect(validateWipeRpcResult({
      operations: 2,
      results: [{ label: "Delete vendors", rows: 0, skipped: true }, { label: "Delete properties", rows: 0 }]
    }, plan.ops)).toBe(false);
  });
});
