import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/owner/home-money/route";

const fixture = vi.hoisted(() => ({
  user: { id: "owner" } as { id: string } | null, role: "owner",
  properties: [] as Array<{ id: string; ownerAccountId: string }>,
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  calls: [] as string[], failTable: ""
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: fixture.user } }) } })
}));
vi.mock("@/lib/auth", () => ({ getCurrentUserRole: async () => fixture.role }));
vi.mock("@/lib/property-access", () => ({
  getAdministeredProperties: async () => fixture.properties,
  canUserAdministerProperty: async (_user: string, property: string) => fixture.properties.some((row) => row.id === property)
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const filters: Array<[string, string, unknown]> = [];
  const builder = {
    select: () => builder,
    eq: (key: string, value: unknown) => { filters.push(["eq", key, value]); return builder; },
    in: (key: string, value: unknown) => { filters.push(["in", key, value]); return builder; },
    gte: (key: string, value: unknown) => { filters.push(["gte", key, value]); return builder; },
    lt: (key: string, value: unknown) => { filters.push(["lt", key, value]); return builder; },
    is: (key: string, value: unknown) => { filters.push(["is", key, value]); return builder; },
    order: () => builder,
    maybeSingle: async () => {
      fixture.calls.push(table);
      return { data: fixture.rows[table]?.find((row) => filters.every(([, key, value]) => row[key] === value)) ?? null,
        error: fixture.failTable === table ? { message: "SECRET DB ERROR" } : null };
    },
    then: (resolve: (result: unknown) => void) => {
      fixture.calls.push(table);
      const data = (fixture.rows[table] ?? []).filter((row) => filters.every(([op, key, value]) =>
        op === "in" ? (value as unknown[]).includes(row[key]) : op === "eq" ? row[key] === value
          : op === "is" ? row[key] === value : op === "gte" ? String(row[key]) >= String(value)
            : String(row[key]) < String(value)));
      resolve({ data, error: fixture.failTable === table ? { message: "SECRET DB ERROR" } : null });
    }
  };
  return builder;
} }) }));
const request = (query = "") => new Request(`http://localhost/api/owner/home-money${query}`);
beforeEach(() => {
  fixture.user = { id: "owner" }; fixture.role = "owner";
  fixture.properties = [{ id: "a", ownerAccountId: "mine" }, { id: "b", ownerAccountId: "mine" },
    { id: "foreign", ownerAccountId: "other" }];
  fixture.rows = { properties: [{ id: "a", name: "A" }, { id: "b", name: "B" },
    { id: "foreign", name: "Foreign" }], units: [], property_expenses: [] };
  fixture.calls = []; fixture.failTable = "";
});
describe("GET home money", () => {
  it("returns 401 without a session", async () => {
    fixture.user = null;
    expect((await GET(request())).status).toBe(401);
  });
  it("returns 403 for a manager", async () => {
    fixture.role = "manager";
    expect((await GET(request())).status).toBe(403);
  });
  it("rejects unknown parameters", async () => {
    expect((await GET(request("?other=x"))).status).toBe(400);
  });
  it("falls back from a foreign account and returns only administered homes", async () => {
    const response = await GET(request("?account=foreign-account"));
    expect(response.status).toBe(200);
    expect((await response.json()).homes.map((home: { propertyId: string }) => home.propertyId)).toEqual(["a", "b"]);
    expect(fixture.calls.filter((table) => table === "units")).toHaveLength(4);
  });
  it("limits homes to three and reports the rest", async () => {
    for (const id of ["c", "d"]) {
      fixture.properties.push({ id, ownerAccountId: "mine" });
      fixture.rows.properties.push({ id, name: id.toUpperCase() });
    }
    const body = await (await GET(request())).json();
    expect(body.homes).toHaveLength(3);
    expect(body.moreCount).toBe(1);
    expect(fixture.calls.filter((table) => table === "units")).toHaveLength(6);
  });
  it("sets private no-store cache headers", async () => {
    const response = await GET(request());
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
  });
  it("returns 500 without raw database errors", async () => {
    fixture.failTable = "units";
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("SECRET DB ERROR");
  });
});
