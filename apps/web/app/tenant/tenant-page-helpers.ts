export type TenantSection = "overview" | "charges" | "maintenance" | "documents" | "notifications";

export const tenantSectionLabel: Record<TenantSection, string> = {
  overview: "Home",
  charges: "Rent",
  maintenance: "Problems",
  documents: "Lease",
  notifications: "Messages"
};

export function parseSearchParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

export function isTenantSection(value: string | null): value is TenantSection {
  return value === "overview" ||
    value === "charges" ||
    value === "maintenance" ||
    value === "documents" ||
    value === "notifications";
}

export function getTenantDisplayName(params: {
  nickname?: string | null;
  fullName?: string | null;
  userEmail: string;
}) {
  const nickname = params.nickname?.trim();
  if (nickname) {
    return nickname;
  }

  const firstName = params.fullName?.trim().split(/\s+/)[0];
  if (firstName) {
    return firstName;
  }

  return params.userEmail;
}
