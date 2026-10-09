import type { PortfolioData, PropertyListItem } from "@/lib/portfolio";

export type HomeScope = { kind: "all" } | { kind: "property" | "account"; id: string };

export function buildHomeGroups(properties: PropertyListItem[]) {
  const groups = new Map<string, {
    id: string;
    name: string;
    isClient: boolean;
    homes: PropertyListItem[];
  }>();
  for (const home of properties) {
    const id = home.ownerAccountId ?? `unassigned:${home.id}`;
    const group = groups.get(id) ?? {
      id, name: home.ownerAccountName, isClient: home.ownerAccountIsClient, homes: []
    };
    group.homes.push(home);
    groups.set(id, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, homes: group.homes.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => Number(b.isClient) - Number(a.isClient) || a.name.localeCompare(b.name));
}

export function resolveHomeScope(scope: HomeScope, properties: PropertyListItem[]): HomeScope {
  if (scope.kind === "property") {
    return properties.some((home) => home.id === scope.id) ? scope : { kind: "all" };
  }
  if (scope.kind === "account") {
    return properties.some((home) => home.ownerAccountId === scope.id) ? scope : { kind: "all" };
  }
  return scope;
}

export function homeIdsForScope(scope: HomeScope, properties: PropertyListItem[]): Set<string> | null {
  const valid = resolveHomeScope(scope, properties);
  if (valid.kind === "all") return null;
  return new Set(properties.filter((home) => valid.kind === "property"
    ? home.id === valid.id : home.ownerAccountId === valid.id).map((home) => home.id));
}

export function filterPortfolioByHomeIds(portfolio: PortfolioData, homeIds: Set<string> | null): PortfolioData {
  if (!homeIds) return portfolio;
  return {
    properties: portfolio.properties.filter((home) => homeIds.has(home.id)),
    units: portfolio.units.filter((unit) => homeIds.has(unit.propertyId)),
    leases: portfolio.leases.filter((lease) => homeIds.has(lease.propertyId)),
    tenants: portfolio.tenants.filter((tenant) => tenant.propertyIds.some((id) => homeIds.has(id)))
  };
}

export function scopeFromParams(propertyId?: string | null, accountId?: string | null): HomeScope {
  if (propertyId) return { kind: "property", id: propertyId };
  if (accountId) return { kind: "account", id: accountId };
  return { kind: "all" };
}

export function scopeFromValue(value: string): HomeScope {
  if (value.startsWith("property:")) return { kind: "property", id: value.slice(9) };
  if (value.startsWith("account:")) return { kind: "account", id: value.slice(8) };
  return { kind: "all" };
}

export function scopeValue(scope: HomeScope): string {
  return scope.kind === "all" ? "" : `${scope.kind}:${scope.id}`;
}

export function writeScopeParams(params: URLSearchParams, scope: HomeScope): URLSearchParams {
  params.delete("property");
  params.delete("account");
  if (scope.kind !== "all") params.set(scope.kind, scope.id);
  return params;
}
