import { todayDenver } from "@/lib/denver-calendar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToBuffer } from "@react-pdf/renderer";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TenantBottomBar } from "@/components/dashboard/tenant-bottom-bar";
import { TenantRentCard } from "@/components/dashboard/tenant-rent-card";
import { InboxSection } from "@/components/dashboard/inbox-section";
import { colors, styles } from "@/lib/pdf/pdf-styles";
import { createReceiptPdfDocument } from "@/lib/pdf/receipt-template";
import type { InboxThreadDTO } from "@/lib/inbox";

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormState: (action: unknown, initial: unknown) => [initial, action],
  useFormStatus: () => ({ pending: false })
}));

const action = vi.fn(async () => ({ success: true as const }));

const thread: InboxThreadDTO = {
  id: "thread", propertyId: "home", propertyName: "Atlas House", entityType: "tenant_profile", entityId: "tenant",
  subject: "Messages with your landlord", createdByProfileId: "tenant", createdAt: "2026-10-05T00:00:00Z",
  updatedAt: "2026-10-05T00:00:00Z", latestMessagePreview: "Thank you.", messageCount: 2,
  messages: [
    { id: "landlord", threadId: "thread", senderProfileId: "landlord", senderEmail: null,
      senderName: "Alex Landlord", body: "Welcome home.", channel: "in_app", direction: "outbound",
      createdAt: "2026-10-05T00:00:00Z" },
    { id: "tenant", threadId: "thread", senderProfileId: "tenant", senderEmail: null,
      senderName: "Aurelia Tenant", body: "Thank you.", channel: "in_app", direction: "inbound",
      createdAt: "2026-10-05T00:01:00Z" }
  ]
};

describe("tenant and manager look", () => {
  it("tenant tab bar keeps labels and uses ink for the active link", () => {
    render(<TenantBottomBar activeItemId="overview" />);
    const nav = screen.getByRole("navigation", { name: "Tenant shortcuts" });
    expect(nav).toHaveClass("border-[var(--ink)]");
    expect(within(nav).getAllByRole("link").map((link) => link.textContent))
      .toEqual(["Home", "Rent", "Repairs", "Messages"]);
    const home = within(nav).getByRole("link", { name: "Home" });
    expect(home).toHaveClass("text-[var(--ink)]", "font-semibold");
    expect(home).not.toHaveClass("bg-[var(--accent-weak)]");
    expect(within(nav).getByRole("link", { name: "Rent" })).toHaveClass("text-[var(--faint)]");
  });

  it("rent due keeps visible copy and displays the amount and outline report button", () => {
    render(<TenantRentCard todayIso={todayDenver()} charges={[{ id: "1", leaseId: "lease", propertyId: "home", propertyLabel: "Home",
      propertyName: "Home", unitNumber: "1", dueDate: "2026-10-01", amountCents: 120000,
      status: "late" }]} payState="not_ready" rentDueDate="2026-10-01" rentAmountCents={120000}
      lastPaidAt={null} onPayCharge={action} onRequestManualPaymentConfirmation={action} />);
    expect(screen.getByText("$1,200")).toHaveClass("font-display");
    expect(screen.getByText("Online pay isn't on yet")).toBeInTheDocument();
    expect(screen.getByText("Your landlord is still setting it up. Pay them the way you usually do for now."))
      .toBeInTheDocument();
    expect(screen.getByText("Already paid? Tell your landlord.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I paid this" })).toHaveClass("border-[var(--ink)]");
  });

  it("messages use hero and surface-3 bubbles with their existing text", () => {
    render(<InboxSection notifications={[]} threads={[thread]} properties={[{ id: "home", name: "Atlas House" }]}
      currentUserId="tenant" onMarkRead={action} onSendMessage={action} onStartTenantConversation={action} />);
    expect(screen.getByText("Thank you.").closest(".rounded-2xl")).toHaveClass("bg-[var(--hero)]");
    expect(screen.getByText("Welcome home.").closest(".rounded-2xl")).toHaveClass("bg-[var(--surface-3)]");
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Alex Landlord")).toBeInTheDocument();
  });

  it("pdf palette uses graphite colors and renders a receipt buffer", async () => {
    expect(colors).toMatchObject({ text: "#0B0C0E", textMuted: "#4D535C", border: "#D9DCE1",
      surface2: "#F3F4F6", accent: "#2442B8", success: "#0E7A3E", danger: "#B4232A" });
    expect(styles.title.fontFamily).toBe("Times-Bold");
    const buffer = await renderToBuffer(createReceiptPdfDocument({ receipts: [{ receiptNumber: "DOM-12345678",
      tenantName: "Aurelia Tenant", propertyName: "Forum Apartments", propertyAddress: "100 Forum Way",
      unitLabel: "Unit 7", amountFormatted: "$1,850.00", dueDate: "October 1, 2026",
      paidDate: "October 1, 2026", paymentMethod: "Card", leaseLabel: "2026", categoryLabel: "Rent",
      referenceNote: "October rent", generatedAt: "October 2, 2026" }] }));
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
