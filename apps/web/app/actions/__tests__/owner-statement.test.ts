import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn() }));
vi.mock("@/app/actions/auth-helpers", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/owner-statement", () => ({ getOwnerStatement: mocks.load,
  StatementAccessError: class StatementAccessError extends Error {} }));
import { getOwnerStatementSummary } from "../owner-statement";
import { StatementAccessError } from "@/lib/owner-statement";
const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => { mocks.auth.mockReset().mockResolvedValue({ user: { id: "m" } }); mocks.load.mockReset(); });
describe("owner statement summary", () => {
  it("rejects months outside the Denver window before loading", async () => {
    expect(await getOwnerStatementSummary(id, "2000-01")).toEqual({ success: false, error: "Pick a month from the list." });
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("hides inactive or foreign client details", async () => {
    mocks.load.mockRejectedValue(new StatementAccessError());
    expect(await getOwnerStatementSummary(id, "2026-10")).toEqual({ success: false,
      error: "You can't see this client." });
  });
  it("maps query errors to a retry message", async () => {
    mocks.load.mockRejectedValue(new Error("database failed"));
    expect(await getOwnerStatementSummary(id, "2026-10")).toEqual({ success: false,
      error: "Could not load the statement. Please try again." });
  });
  it("returns totals and home count from the shared statement", async () => {
    mocks.load.mockResolvedValue({ totals: { paymentsCents: 100, expensesCents: 20,
      netCents: 80, stillOwedCents: 0 }, homes: [{ id: "h" }] });
    expect(await getOwnerStatementSummary(id, "2026-10")).toEqual({ success: true,
      totals: { paymentsCents: 100, expensesCents: 20, netCents: 80, stillOwedCents: 0 }, homeCount: 1 });
  });
});
