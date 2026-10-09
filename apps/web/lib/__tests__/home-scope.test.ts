import { describe, expect, it } from "vitest";
import {
  buildHomeGroups, filterPortfolioByHomeIds, homeIdsForScope, resolveHomeScope,
  scopeFromParams, scopeFromValue, scopeValue, writeScopeParams
} from "@/lib/home-scope";
import type { PortfolioData, PropertyListItem } from "@/lib/portfolio";

const home = (id: string, accountId: string, accountName: string, isClient: boolean): PropertyListItem => ({
  id, name: id, addressLine1: "", city: "", state: "", postalCode: "",
  managementFeeCents: 0, unitCount: 1, ownerAccountId: accountId,
  ownerAccountName: accountName, ownerAccountIsClient: isClient, active: true
});
const properties = [home("b", "client", "Zen", true), home("a", "client", "Zen", true),
  home("c", "owner", "Able", false)];
const portfolio: PortfolioData = {
  properties,
  units: properties.map((property) => ({ id: `u-${property.id}`, propertyId: property.id,
    propertyName: property.name, unitNumber: "1", bedrooms: 1, bathrooms: 1,
    monthlyRentCents: 100, squareFeet: null, occupied: true, active: true })),
  leases: [],
  tenants: [{ id: "t", email: "t@example.test", fullName: "T", phone: null, propertyIds: ["a", "c"] }]
};

describe("home scope", () => {
  it("sorts client accounts first and homes alphabetically", () => {
    expect(buildHomeGroups(properties).map((group) => [group.name, group.homes.map((home) => home.id)]))
      .toEqual([["Zen", ["a", "b"]], ["Able", ["c"]]]);
  });

  it("filters all portfolio collections for account, home, or all", () => {
    const account = homeIdsForScope({ kind: "account", id: "client" }, properties);
    expect([...account!]).toEqual(["b", "a"]);
    expect(filterPortfolioByHomeIds(portfolio, account).properties.map((property) => property.id)).toEqual(["b", "a"]);
    expect(filterPortfolioByHomeIds(portfolio, account).units.map((unit) => unit.propertyId)).toEqual(["b", "a"]);
    expect(filterPortfolioByHomeIds(portfolio, account).tenants[0].id).toBe("t");
    expect([...homeIdsForScope({ kind: "property", id: "c" }, properties)!]).toEqual(["c"]);
    expect(filterPortfolioByHomeIds(portfolio, homeIdsForScope({ kind: "all" }, properties))).toBe(portfolio);
  });

  it("round trips exclusive URL scopes and rejects stale ids", () => {
    const params = new URLSearchParams("section=charges&property=a");
    writeScopeParams(params, { kind: "account", id: "client" });
    expect(params.toString()).toBe("section=charges&account=client");
    expect(scopeValue(scopeFromParams(params.get("property"), params.get("account")))).toBe("account:client");
    writeScopeParams(params, scopeFromValue("property:c"));
    expect(params.toString()).toBe("section=charges&property=c");
    expect(resolveHomeScope(scopeFromParams("missing", null), properties)).toEqual({ kind: "all" });
    writeScopeParams(params, { kind: "all" });
    expect(params.toString()).toBe("section=charges");
  });
});
