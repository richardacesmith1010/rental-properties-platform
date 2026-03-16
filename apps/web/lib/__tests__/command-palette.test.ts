import { Building2, LayoutDashboard, Plus, Search } from "lucide-react";
import { describe, expect, it } from "vitest";
import {
  groupCommandResults,
  searchCommandPalette,
  type CommandPaletteProperty,
  type CommandPaletteQuickAction,
  type CommandPaletteSection,
  type CommandPaletteTenant,
  type CommandPaletteTransaction
} from "@/components/dashboard/command-palette";

const sections: CommandPaletteSection[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Portfolio snapshot and KPIs.",
    icon: LayoutDashboard
  },
  {
    id: "charges",
    label: "Charges",
    description: "Rent charges and payment status.",
    icon: Search
  }
];

const properties: CommandPaletteProperty[] = [
  {
    id: "property-1",
    name: "123 Main St",
    address: "123 Main St, Denver, CO"
  }
];

const tenants: CommandPaletteTenant[] = [
  {
    id: "tenant-1",
    name: "Jane Smith",
    email: "jane@example.com"
  }
];

const transactions: CommandPaletteTransaction[] = [
  {
    id: "charge-1",
    label: "123 Main St • Unit 2",
    description: "Jane Smith • pending • Mar 18",
    sectionId: "charges",
    propertyId: "property-1",
    icon: Building2
  }
];

const quickActions: CommandPaletteQuickAction[] = [
  {
    id: "add-property",
    label: "Add Property",
    description: "Start the new property workflow.",
    icon: Plus,
    keywords: ["create property"]
  }
];

describe("searchCommandPalette", () => {
  it("returns section results by default when the query is empty", () => {
    const results = searchCommandPalette({
      query: "",
      sections,
      properties,
      tenants,
      transactions,
      quickActions
    });

    expect(results[0]?.type).toBe("section");
    expect(results.some((result) => result.group === "Quick Actions")).toBe(true);
  });

  it("matches section labels and descriptions", () => {
    const results = searchCommandPalette({
      query: "payment",
      sections,
      properties,
      tenants,
      transactions,
      quickActions
    });

    expect(results.map((result) => result.id)).toContain("charges");
  });

  it("matches property names and addresses", () => {
    const results = searchCommandPalette({
      query: "denver",
      sections,
      properties,
      tenants,
      transactions,
      quickActions
    });

    expect(results.find((result) => result.type === "property")?.id).toBe("property-1");
  });

  it("matches tenants case-insensitively", () => {
    const results = searchCommandPalette({
      query: "JANE@EXAMPLE.COM",
      sections,
      properties,
      tenants,
      transactions,
      quickActions
    });

    expect(results.find((result) => result.type === "tenant")?.id).toBe("tenant-1");
  });

  it("matches transaction descriptions", () => {
    const results = searchCommandPalette({
      query: "pending",
      sections,
      properties,
      tenants,
      transactions,
      quickActions
    });

    expect(results.find((result) => result.type === "transaction")?.id).toBe("charge-1");
  });

  it("matches quick action keywords", () => {
    const results = searchCommandPalette({
      query: "create property",
      sections,
      properties,
      tenants,
      transactions,
      quickActions
    });

    expect(results.find((result) => result.type === "quick_action")?.id).toBe("add-property");
  });

  it("respects the max result limit", () => {
    const repeatedSections = Array.from({ length: 12 }, (_, index) => ({
      id: `section-${index}`,
      label: `Section ${index}`,
      description: "Sample section",
      icon: LayoutDashboard
    }));

    const results = searchCommandPalette({
      query: "section",
      sections: repeatedSections,
      properties: [],
      tenants: [],
      maxResults: 5
    });

    expect(results).toHaveLength(5);
  });
});

describe("groupCommandResults", () => {
  it("preserves group ordering and omits empty groups", () => {
    const groups = groupCommandResults([
      {
        id: "overview",
        type: "section",
        label: "Overview",
        secondary: "Portfolio snapshot",
        icon: LayoutDashboard,
        group: "Sections"
      },
      {
        id: "property-1",
        type: "property",
        label: "123 Main St",
        secondary: "Denver, CO",
        icon: Building2,
        group: "Properties"
      },
      {
        id: "tenant-1",
        type: "tenant",
        label: "Jane Smith",
        secondary: "jane@example.com",
        icon: Search,
        group: "Tenants"
      }
    ]);

    expect(groups.map((group) => group.label)).toEqual(["Sections", "Properties", "Tenants"]);
  });
});
