import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => Object.fromEntries([
  "addTicketComment", "createMaintenanceTicket", "deleteMaintenancePhoto", "disableAutopay",
  "markAllNotificationsRead", "markNotificationRead", "requestManualPaymentConfirmation",
  "sendInboxMessage", "startTenantConversation", "signDocumentPacket", "signOut",
  "payWithCard", "setupAutopay", "uploadMaintenancePhoto"
].map((name) => [name, vi.fn()])));
vi.mock("@/app/actions/charges", () => ({
  payWithACH: vi.fn(), payWithACHState: vi.fn(), payWithCardState: vi.fn()
}));
vi.mock("@/app/actions/autopay", () => ({ getAutopayEnrollments: async () => [] }));
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: async () => ({ id: "tenant-1", email: "tenant@example.com" }),
  getCurrentUserRole: async () => "tenant",
  getUserProfileSummary: async () => ({
    onboardingCompletedAt: "2026-01-01", nickname: "Taylor", fullName: "Taylor Tenant", avatarUrl: null
  })
}));
vi.mock("@/lib/feature-capabilities", () => ({
  getFeatureCapabilities: async () => ({
    documentsEnabled: false, notificationsEnabled: false, inboxThreadsEnabled: false,
    warnings: {}
  })
}));
vi.mock("@/lib/tenant-payments", () => ({ getTenantPaymentData: async () => ({ charges: [] }) }));
vi.mock("@/lib/payment-history", () => ({ getTenantPaymentHistory: async () => [{
  chargeId: "charge-1", paymentId: "payment-1", paidAt: "2026-09-01T15:00:00Z",
  amountCents: 120000, method: "ach", category: "rent", dueDate: "2026-09-01",
  propertyName: "Forum House", unitNumber: "1", referenceNote: null, reversedAt: null
}] }));
vi.mock("@/lib/leases", () => ({ getTenantLeaseDetails: async () => [] }));
vi.mock("@/lib/maintenance", () => ({ getTenantMaintenanceData: async () => ({ tickets: [], units: [] }) }));
vi.mock("@/lib/stripe-connect", () => ({ arePropertyOwnersConnected: async () => new Map() }));
vi.mock("@/lib/tenant-pay-state", () => ({
  getTenantPayState: () => "no_lease", getNextRentDueDate: () => null
}));
vi.mock("@/components/dashboard/sidebar-nav", () => ({
  SidebarNav: () => null, MobileTopBar: () => null
}));
vi.mock("@/components/dashboard/tenant-rent-card", () => ({ TenantRentCard: () => null }));
vi.mock("@/components/dashboard/charges-section", () => ({ ChargesSection: () => null }));
vi.mock("@/components/dashboard/tenant-bottom-bar", () => ({ TenantBottomBar: () => null }));
vi.mock("@/components/shared/stripe-test-mode-banner", () => ({ StripeTestModeBanner: () => null }));

import TenantPage from "@/app/tenant/page";

describe("tenant Rent page", () => {
  it("paid line shows the date only", async () => {
    const page = await TenantPage({ searchParams: Promise.resolve({ section: "charges" }) });
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(page);
    expect(container.textContent).toContain("Paid Sep 1, 2026");
    expect(container.textContent).not.toContain("3:00 PM");
  });
});
