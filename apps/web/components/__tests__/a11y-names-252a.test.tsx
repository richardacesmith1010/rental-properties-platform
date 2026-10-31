import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { TicketStatusControl } from "@/components/dashboard/ticket-status-control";
import { InboxSection } from "@/components/dashboard/inbox-section";
import { LeasingHubSection } from "@/components/dashboard/leasing-hub-section";
import { ApplicationsSection } from "@/components/dashboard/applications-section";
import { InvitationsSection } from "@/components/dashboard/invitations-section";
import { InviteTenantForm } from "@/components/dashboard/invitations/invite-tenant-form";
import { CreateAccountWorkflowCard, LinkPropertyWorkflowCard } from
  "@/components/dashboard/ownership/create-account-form";
import { ExpenseForm } from "@/components/dashboard/expenses/expense-form";
import { ExpenseList } from "@/components/dashboard/expenses/expense-list";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { PortfolioSection } from "@/components/dashboard/portfolio-section";
import TermsPage from "@/app/terms/page";
import PrivacyPage from "@/app/privacy/page";
import type { ExpenseDashboardData } from "@/lib/expenses";

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormState: (action: unknown, initial: unknown) => [initial, action],
  useFormStatus: () => ({ pending: false })
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const action = vi.fn(async () => ({ success: true as const }));
const property = { id: "home-1", name: "Atlas House", addressLine1: "1 Main St", city: "Denver",
  state: "CO", postalCode: "80202", managementFeeCents: 0, unitCount: 1,
  ownerAccountId: "account-1", ownerAccountName: "Atlas LLC", ownerAccountIsClient: false, active: true };
const expenseData: ExpenseDashboardData = { enabled: true, warning: null,
  properties: [{ id: property.id, name: property.name }],
  expenses: [{ id: "expense-1", propertyId: property.id, propertyName: property.name,
    category: "repair", description: null, amountCents: 1000, expenseDate: "2026-10-16",
    recurring: false, recurringFrequency: null, vendorId: null, vendorName: null,
    receiptFileId: null, createdAt: "2026-10-16" }],
  pnlByProperty: [], monthlyByProperty: {}, categoryByProperty: {} };

const namedSelect = (name: string) => expect(screen.getByRole("combobox", { name })).toBeInTheDocument();

describe("Sprint 252a accessible controls", () => {
  it("names repair status and both inbox filters", () => {
    const { unmount } = render(<TicketStatusControl ticketId="ticket-1" currentStatus="open"
      onUpdateStatus={action} />);
    namedSelect("Repair status");
    unmount();
    render(<InboxSection viewerRole="owner" notifications={[]} threads={[]} properties={[]}
      onMarkRead={action} />);
    namedSelect("Filter by status");
    namedSelect("Filter by event");
  });

  it("names the listing and application pickers", () => {
    const portfolio = { properties: [property], units: [], leases: [] } as unknown as
      ComponentProps<typeof LeasingHubSection>["portfolio"];
    const { unmount } = render(<LeasingHubSection portfolio={portfolio} invitations={[]}
      documents={{ packets: [] } as unknown as ComponentProps<typeof LeasingHubSection>["documents"]} listings={[]}
      applicationCount={0} approvedApplicationCount={0} chargeCount={0} />);
    namedSelect("Property");
    unmount();
    render(<ApplicationsSection applications={[]} listings={[]} properties={[]} />);
    namedSelect("Listing");
  });

  it("names the tenant and co-owner invitation pickers", () => {
    const { unmount } = render(<InviteTenantForm properties={[property]} onInviteTenant={action} />);
    namedSelect("Property");
    unmount();
    render(<InvitationsSection ownershipAccounts={[{ id: "account-1", displayName: "Atlas LLC" }]}
      properties={[property]} invitations={[]} onInviteTenant={action} onInviteManager={action}
      onInviteOwner={action} onResendInvite={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Send Invitation" }));
    fireEvent.click(screen.getByRole("button", { name: "Co-owner Invite" }));
    namedSelect("Ownership account");
  });

  it("names both ownership workflow pickers", () => {
    const { unmount } = render(<CreateAccountWorkflowCard state={null} action={vi.fn()} createStep={0}
      setCreateStep={vi.fn()} createDraft={{ accountType: "llc", displayName: "" }} setCreateDraft={vi.fn()} />);
    namedSelect("Account type");
    unmount();
    const props = { state: null, action: vi.fn(), setLinkStep: vi.fn(),
      linkDraft: { propertyId: "", ownershipAccountId: "" }, setLinkDraft: vi.fn(),
      properties: [{ id: property.id, name: property.name, ownerAccountName: "Atlas LLC" }],
      accountOptions: [{ id: "account-1", displayName: "Atlas LLC" }] };
    const view = render(<LinkPropertyWorkflowCard {...props} linkStep={0} />);
    namedSelect("Property");
    view.rerender(<LinkPropertyWorkflowCard {...props} linkStep={1} />);
    namedSelect("Ownership account");
  });

  it("names expense filters, dates, and edit controls", () => {
    render(<ExpenseList data={expenseData} vendors={[]} propertyFiles={[]}
      onUpdateExpense={action} onDeleteExpense={action} />);
    namedSelect("Filter by property");
    namedSelect("Filter by category");
    expect(screen.getByLabelText("Start date")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("End date")).toHaveAttribute("type", "date");
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    for (const name of ["Expense category", "Recurring frequency", "Vendor", "Receipt file"]) namedSelect(name);
    expect(screen.getByLabelText("Expense date")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Upload receipt")).toHaveAttribute("type", "file");
  });

  it("names each expense creation picker and date", () => {
    render(<ExpenseForm data={expenseData} vendors={[]} propertyFiles={[]} onCreateExpense={action} />);
    namedSelect("Property");
    fireEvent.change(screen.getByRole("combobox", { name: "Property" }), { target: { value: property.id } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    namedSelect("Expense category");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByPlaceholderText("Amount (USD)"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText("Expense date")).toHaveAttribute("type", "date");
    fireEvent.change(screen.getByLabelText("Expense date"), { target: { value: "2026-10-16" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    namedSelect("Recurring frequency");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    namedSelect("Vendor");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    namedSelect("Receipt file");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText("Upload receipt")).toHaveAttribute("type", "file");
  });

  it("names the profile photo input", () => {
    render(<ProfileSettings email="ana@example.test" fullName="Ana Ruiz" onUpdateProfile={action} />);
    expect(screen.getByLabelText("Profile photo")).toHaveAttribute("type", "file");
  });

  it("makes the manager message list keyboard scrollable", () => {
    const thread = { id: "thread-1", propertyId: property.id, propertyName: property.name,
      entityType: "tenant_profile", entityId: "tenant-1", subject: "Message", createdByProfileId: "tenant-1",
      createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z",
      latestMessagePreview: "Hello", messageCount: 1,
      messages: [{ id: "message-1", threadId: "thread-1", senderProfileId: "tenant-1",
        senderEmail: null, senderName: "Alex", body: "Hello", channel: "in_app", direction: "inbound",
        createdAt: "2026-10-05T00:00:00Z" }] };
    render(<InboxSection viewerRole="manager" notifications={[]} threads={[thread] as
      ComponentProps<typeof InboxSection>["threads"]} properties={[property]} onMarkRead={action} />);
    expect(screen.getByLabelText("Messages list")).toHaveAttribute("tabindex", "0");
  });

  it("keeps the manager home action separate from inner controls", () => {
    const onSelectProperty = vi.fn();
    const { container } = render(<PortfolioSection role="manager" properties={[property]}
      onSelectProperty={onSelectProperty} getPropertyDetailHref={() => "/manager/properties/home-1"} />);
    expect(container.querySelector('[role="button"] button, [role="button"] a')).toBeNull();
    const open = screen.getByRole("button", { name: "Atlas House" });
    fireEvent.click(open);
    open.focus();
    fireEvent.keyDown(open, { key: "Enter" });
    fireEvent.keyDown(open, { key: " " });
    expect(onSelectProperty).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("link", { name: "View Details" })).toBeInTheDocument();
  });

  it("uses muted text for both legal update dates", () => {
    const terms = render(<TermsPage />);
    expect(screen.getByText("Last updated: October 30, 2026")).toHaveClass("text-[var(--muted)]");
    terms.unmount();
    render(<PrivacyPage />);
    expect(screen.getByText("Last updated: October 30, 2026")).toHaveClass("text-[var(--muted)]");
  });
});
