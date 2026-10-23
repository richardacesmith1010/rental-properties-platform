import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { Dashboard } from "@/components/dashboard";
import type { DashboardProps } from "@/components/dashboard/types";
import { CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { ChargesSection } from "@/components/dashboard/charges-section";
import { MaintenanceSection } from "@/components/dashboard/maintenance-section";
import { InboxSection } from "@/components/dashboard/inbox-section";
import { UnitsSection } from "@/components/dashboard/units-section";
import { LeasesSection } from "@/components/dashboard/leases-section";
import { TenantsSection } from "@/components/dashboard/tenants-section";
import type { MaintenanceTicket } from "@/lib/maintenance";

const state = vi.hoisted(() => ({ role: "manager" as "manager" | "owner" }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams()
}));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormState: (action: unknown, initial: unknown) => [initial, action],
  useFormStatus: () => ({ pending: false })
}));
vi.mock("@/components/dashboard/dashboard-data-loader", () => ({ useDashboardData: () => ({
  activeSection: "charges", activeSectionLabel: "Rent", activeSectionIndex: 1,
  isOwnerRole: state.role === "owner", isManagerRole: state.role === "manager", isOwnerDailyOpsHomePage: false,
  ownerOnboarding: { shouldShow: false }, llcSetupPrompt: { shouldShow: false },
  layoutProps: {}, displayDashboardData: { kpis: {} }, filteredPortfolio: { properties: [] },
  safePortfolio: { properties: [] }, sectionItems: [{ id: "charges" }],
  sectionRendererProps: { openSection: vi.fn(), filteredTickets: [] }, commandPaletteProps: {},
  closePropertyWizard: vi.fn(), closeLeaseWizard: vi.fn(), closeTenantInviteWizard: vi.fn(),
  isPropertyWizardOpen: false, isLeaseWizardOpen: false, isTenantInviteWizardOpen: false
}) }));
vi.mock("@/components/dashboard/dashboard-layout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>
}));
vi.mock("@/components/dashboard/section-renderer", () => ({ SectionRenderer: () => <p>Rent content</p> }));
vi.mock("@/components/dashboard/section-map", () => ({ SectionSkeleton: () => null }));

function expectSectionHeading(key: string, title: RegExp) {
  expect(document.querySelector(`#${key}`)).toBeNull();
  expect(screen.getByRole("heading", { level: 2, name: title })).toBeVisible();
}

describe("Sprint 254b heading structure", () => {
  it.each(["manager", "owner"] as const)("H1 %s section has one page h1", (role) => {
    state.role = role;
    try {
      render(<Dashboard {...{ userEmail: `${role}@example.test`, data: { profileRole: role } } as DashboardProps} />);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Rent");
    } finally { state.role = "manager"; }
  });

  it("H2 CardTitle keeps classes at either heading level", () => {
    const view = render(<CardTitle>Default title</CardTitle>);
    const defaultTitle = screen.getByRole("heading", { level: 3, name: "Default title" });
    const classes = defaultTitle.className;
    view.rerender(<CardTitle as="h2">Section title</CardTitle>);
    expect(screen.getByRole("heading", { level: 2, name: "Section title" }).className).toBe(classes);
  });

  it("H3 charges has no inner section id and uses h2", () => {
    render(<ChargesSection charges={[]} todayIso="2026-10-22" onPayCharge={async () => {}} />);
    expectSectionHeading("charges", /^Rent$/);
  });

  it("H3 maintenance has no inner section id and uses h2", () => {
    render(<MaintenanceSection tickets={[]} />);
    expectSectionHeading("maintenance", /^Repairs$/);
  });

  it("H3 inbox has no inner section id and uses h2", () => {
    render(<InboxSection viewerRole="owner" notifications={[]} threads={[]} properties={[]}
      onMarkRead={async () => ({ success: true })} />);
    expectSectionHeading("inbox", /^Domus Inbox$/);
  });

  it("H3 units has no inner section id and uses h2", () => {
    render(<UnitsSection units={[]} />);
    expectSectionHeading("units", /^Units$/);
  });

  it("H3 leases has no inner section id and uses h2", () => {
    render(<LeasesSection leases={[]} />);
    expectSectionHeading("leases", /^Leases$/);
  });

  it("H3 tenants has no inner section id and uses h2", () => {
    render(<TenantsSection tenants={[]} leases={[]} properties={[]} units={[]} />);
    expectSectionHeading("tenants", /^Tenants/);
  });

  it("H4 owner repairs has no empty or skipped headings with open and closed tickets", () => {
    const ticket: MaintenanceTicket = {
      id: "open", propertyId: "home", propertyName: "Maple House", unitNumber: "1",
      title: "Leaking sink", description: "The sink leaks.", status: "open", priority: "medium",
      actualCostCents: null, vendorName: null, assignmentStatus: null, photoCount: 0,
      latestPhotoId: null, photos: [], createdAt: "2026-10-20T12:00:00Z", resolvedAt: null,
      tenantEmail: "tenant@example.test", commentCount: 0, comments: [], timeline: []
    };
    const { container } = render(<><h1>Repairs</h1><section id="maintenance">
      <MaintenanceSection viewerRole="owner" tickets={[ticket, {
        ...ticket, id: "closed", title: "Fixed lock", status: "closed", resolvedAt: "2026-10-21T12:00:00Z"
      }]} />
    </section></>);
    const headings = [...container.querySelectorAll("h1,h2,h3,h4,h5,h6")];
    expect(headings.every((heading) => heading.textContent?.trim())).toBe(true);
    const levels = headings.map((heading) => Number(heading.tagName.slice(1)));
    expect(levels.slice(1).every((level, index) => level - levels[index] <= 1)).toBe(true);
    expect(levels).toEqual([1, 2]);
  });

  it("H4 empty-state labels with no text do not create an empty heading", () => {
    render(<EmptyState title="   " description="No repairs yet." />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("No repairs yet.")).toBeVisible();
  });
});
