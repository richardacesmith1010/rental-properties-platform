import { beforeEach, describe, expect, it, vi } from "vitest";

const admin = vi.hoisted(() => vi.fn());
const active = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: admin }));
vi.mock("@/lib/client-accounts", () => ({ isActiveClientManager: active }));
import { getHomeStatus, getClientsOverview, getClientDetail, summarizeClientHomes } from "@/lib/client-overview";

const now = new Date("2026-11-01T03:00:00Z"); // October 31 in Denver
const lease = [{ id: "lease-1", unit_id: "unit-1", active: true }];
const rent = (due_date: string, status: string) => [{ lease_id: "lease-1", due_date, status }];

describe("client summary", () => {
  const home = (status: "overdue" | "paid" | "due" | "no_tenant", dueLabel?: string, dueDate?: string) =>
    ({ id: status, name: status, address: "", status, dueLabel, dueDate });
  it("shows overdue count before paid or due", () => {
    expect(summarizeClientHomes([home("overdue"), home("paid")])).toBe("1 rent overdue");
  });
  it("shows paid only when every leased home is paid", () => {
    expect(summarizeClientHomes([home("paid"), home("paid"), home("no_tenant")])).toBe("All rent paid this month");
  });
  it("shows the earliest due date", () => {
    expect(summarizeClientHomes([home("due", "Jan 3", "2027-01-03"), home("due", "Dec 30", "2026-12-30")]))
      .toBe("Rent due Dec 30");
  });
  it("shows no tenants when no home has rent", () => {
    expect(summarizeClientHomes([home("no_tenant")])).toBe("No tenants yet");
  });
});

describe("client rent status", () => {
  it("uses the property's Denver date at a UTC month edge", () => {
    expect(getHomeStatus(lease, rent("2026-10-31", "pending"), now)).toEqual({
      status: "due", dueLabel: "Oct 31", dueDate: "2026-10-31"
    });
    expect(getHomeStatus(lease, rent("2026-10-31", "paid"), now)).toEqual({ status: "paid" });
  });
  it("prioritizes overdue over paid and due", () => {
    expect(getHomeStatus(lease, [...rent("2026-10-30", "pending"), ...rent("2026-10-31", "paid")], now)).toEqual({ status: "overdue" });
    expect(getHomeStatus([], rent("2026-10-30", "pending"), now)).toEqual({ status: "no_tenant" });
    expect(getHomeStatus([{ ...lease[0], due_day_of_month: 1 }], [], now))
      .toEqual({ status: "due", dueLabel: "Nov 1", dueDate: "2026-11-01" });
  });
  it("treats waived past-due rent as settled", () => {
    expect(getHomeStatus(lease, rent("2026-10-30", "waived"), now)).toEqual({
      status: "due", dueLabel: "Nov 1", dueDate: "2026-11-01"
    });
  });
  it("does not label waived current-month rent as paid", () => {
    expect(getHomeStatus(lease, rent("2026-10-31", "waived"), now).status).toBe("due");
  });
});

function mockDatabase(clientCount: number, rows?: Record<string, unknown[]>, errorTable?: string) {
  const tables: Record<string, unknown[]> = rows ?? {
    ownership_account_managers: Array.from({ length: clientCount }, (_, i) => ({ account_id: `client-${i}` })),
    ownership_accounts: Array.from({ length: clientCount }, (_, i) => ({ id: `client-${i}`, display_name: `Client ${i}`,
      account_type: "individual", client_contact_email: null, managed_client: true })),
    properties: Array.from({ length: clientCount }, (_, i) => ({ id: `home-${i}`, owner_account_id: `client-${i}`,
      name: `Home ${i}`, address_line1: "1 Main", city: "Denver", state: "CO", postal_code: "80202" })),
    units: [], leases: [], rent_charges: []
  };
  const calls: string[] = [];
  admin.mockImplementation(() => ({ from: (table: string) => {
    calls.push(table);
    const response = { data: tables[table] ?? [], error: table === errorTable ? new Error("db") : null };
    const chain = { select: () => chain, eq: () => chain, in: () => chain,
      then: (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve) };
    return chain;
  } }));
  return calls;
}

beforeEach(() => { vi.clearAllMocks(); active.mockResolvedValue(true); });

describe("client overview queries", () => {
  it("keeps query count constant for one and five clients", async () => {
    const one = mockDatabase(1);
    expect((await getClientsOverview("manager")).map((client) => client.summary)).toEqual(["No tenants yet"]);
    const oneCount = one.length;
    const five = mockDatabase(5);
    expect(await getClientsOverview("manager")).toHaveLength(5);
    expect(five).toHaveLength(oneCount);
  });
  it("returns null for a foreign client", async () => {
    active.mockResolvedValue(false);
    expect(await getClientDetail("manager", "foreign")).toBeNull();
    expect(admin).not.toHaveBeenCalled();
  });
  it("does not count inactive homes", async () => {
    const rows = {
      ownership_account_managers: [{ account_id: "client-0" }],
      ownership_accounts: [{ id: "client-0", display_name: "Client 0", account_type: "individual", client_contact_email: null, managed_client: true }],
      properties: [
        { id: "active-home", owner_account_id: "client-0", name: "Active", address_line1: "1 Main", city: "Denver", state: "CO", postal_code: "80202", active: true },
        { id: "archived-home", owner_account_id: "client-0", name: "Archived", address_line1: "2 Main", city: "Denver", state: "CO", postal_code: "80202", active: false }
      ], units: [], leases: [], rent_charges: []
    };
    mockDatabase(0, rows);
    const [client] = await getClientsOverview("manager");
    expect(client.homeCount).toBe(1);
  });
  it("throws on a query error", async () => {
    mockDatabase(1, undefined, "properties");
    await expect(getClientsOverview("manager")).rejects.toThrow("db");
  });
});
