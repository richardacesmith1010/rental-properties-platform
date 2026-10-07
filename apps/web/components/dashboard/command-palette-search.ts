"use client";

import { Building2, CreditCard, User, type LucideIcon } from "lucide-react";

export interface CommandPaletteSection {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  keywords?: string[];
  shortcutHint?: string;
}

export interface CommandPaletteProperty {
  id: string;
  name: string;
  address?: string;
}

export interface CommandPaletteTenant {
  id: string;
  name: string;
  email: string;
}

export interface CommandPaletteTransaction {
  id: string;
  label: string;
  description: string;
  sectionId: string;
  propertyId?: string | null;
  icon?: LucideIcon;
  keywords?: string[];
}

export interface CommandPaletteQuickAction {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  keywords?: string[];
  shortcutHint?: string;
}

export type CommandPaletteResult = {
  id: string;
  type: "section" | "property" | "tenant" | "transaction" | "quick_action";
  label: string;
  secondary: string;
  icon: LucideIcon;
  group: "Sections" | "Properties" | "Tenants" | "Transactions" | "Quick Actions";
  shortcutHint?: string;
  propertyId?: string | null;
  sectionId?: string;
  keywords?: string[];
};

interface SearchCommandPaletteParams {
  query: string;
  sections: CommandPaletteSection[];
  properties: CommandPaletteProperty[];
  tenants: CommandPaletteTenant[];
  transactions?: CommandPaletteTransaction[];
  quickActions?: CommandPaletteQuickAction[];
  maxResults?: number;
}

interface GroupedCommandResults {
  label: CommandPaletteResult["group"];
  items: CommandPaletteResult[];
}

const RESULT_ORDER: CommandPaletteResult["group"][] = [
  "Sections",
  "Properties",
  "Tenants",
  "Transactions",
  "Quick Actions"
];

function normalizeQuery(value: string) {
  return value.trim().toLowerCase();
}

function matchesQuery(query: string, values: Array<string | null | undefined>) {
  if (!query) {
    return true;
  }

  return values
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(query));
}

export function searchCommandPalette({
  query,
  sections,
  properties,
  tenants,
  transactions = [],
  quickActions = [],
  maxResults = 10
}: SearchCommandPaletteParams): CommandPaletteResult[] {
  const normalizedQuery = normalizeQuery(query);
  const sectionResults = sections
    .filter((section) =>
      matchesQuery(normalizedQuery, [section.label, section.description, ...(section.keywords ?? [])])
    )
    .map<CommandPaletteResult>((section) => ({
      id: section.id,
      type: "section",
      label: section.label,
      secondary: section.description,
      icon: section.icon,
      group: "Sections",
      shortcutHint: section.shortcutHint ?? "Enter",
      sectionId: section.id,
      keywords: section.keywords
    }));

  const propertyResults = properties
    .filter((property) => matchesQuery(normalizedQuery, [property.name, property.address]))
    .map<CommandPaletteResult>((property) => ({
      id: property.id,
      type: "property",
      label: property.name,
      secondary: property.address ?? "Property",
      icon: Building2,
      group: "Properties",
      shortcutHint: "Enter"
    }));

  const tenantResults = tenants
    .filter((tenant) => matchesQuery(normalizedQuery, [tenant.name, tenant.email]))
    .map<CommandPaletteResult>((tenant) => ({
      id: tenant.id,
      type: "tenant",
      label: tenant.name,
      secondary: tenant.email,
      icon: User,
      group: "Tenants",
      shortcutHint: "Enter"
    }));

  const transactionResults = transactions
    .filter((transaction) =>
      matchesQuery(normalizedQuery, [transaction.label, transaction.description, ...(transaction.keywords ?? [])])
    )
    .map<CommandPaletteResult>((transaction) => ({
      id: transaction.id,
      type: "transaction",
      label: transaction.label,
      secondary: transaction.description,
      icon: transaction.icon ?? CreditCard,
      group: "Transactions",
      shortcutHint: "Enter",
      sectionId: transaction.sectionId,
      propertyId: transaction.propertyId,
      keywords: transaction.keywords
    }));

  const quickActionResults = quickActions
    .filter((action) =>
      matchesQuery(normalizedQuery, [action.label, action.description, ...(action.keywords ?? [])])
    )
    .map<CommandPaletteResult>((action) => ({
      id: action.id,
      type: "quick_action",
      label: action.label,
      secondary: action.description,
      icon: action.icon,
      group: "Quick Actions",
      shortcutHint: action.shortcutHint ?? "Enter",
      keywords: action.keywords
    }));

  const orderedResults = [
    ...sectionResults,
    ...propertyResults,
    ...tenantResults,
    ...transactionResults,
    ...quickActionResults
  ];

  if (!normalizedQuery) {
    return [...sectionResults.slice(0, Math.max(maxResults - 3, 1)), ...quickActionResults.slice(0, 3)].slice(
      0,
      maxResults
    );
  }

  return orderedResults.slice(0, maxResults);
}

export function groupCommandResults(results: CommandPaletteResult[]): GroupedCommandResults[] {
  const groups = new Map<CommandPaletteResult["group"], CommandPaletteResult[]>();

  for (const group of RESULT_ORDER) {
    groups.set(group, []);
  }

  for (const result of results) {
    groups.get(result.group)?.push(result);
  }

  return RESULT_ORDER
    .map((label) => ({ label, items: groups.get(label) ?? [] }))
    .filter((group) => group.items.length > 0);
}

