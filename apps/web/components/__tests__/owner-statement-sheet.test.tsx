import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientDetail } from "@/components/dashboard/clients/client-detail";
const mocks = vi.hoisted(() => ({ summary: vi.fn() }));
vi.mock("@/app/actions/owner-statement", () => ({ getOwnerStatementSummary: mocks.summary }));
vi.mock("@/components/dashboard/unified-property-wizard", () => ({ UnifiedPropertyWizard: () => null }));
const client = { id: "00000000-0000-4000-8000-000000000001", name: "Example Homes",
  accountType: "llc" as const, contactEmail: null, homes: [] };
const props = { client, defaultMonth: "2026-09", monthOptions: ["2026-10", "2026-09"],
  onCreatePropertyWithSetup: vi.fn(), onCreateClientAccount: vi.fn() };
beforeEach(() => mocks.summary.mockReset().mockResolvedValue({ success: true, homeCount: 1,
  totals: { paymentsCents: 145000, expensesCents: 25000, netCents: 120000, stillOwedCents: 5000 } }));
describe("owner statement sheet", () => {
  it("opens, loads totals and links both downloads", async () => {
    render(<ClientDetail {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Owner statement" }));
    await waitFor(() => expect(screen.getByText("$1,450.00")).toBeInTheDocument());
    expect(screen.getByLabelText("Month")).toHaveValue("2026-09");
    expect(screen.getByText("$50.00")).toHaveClass("text-[var(--warn)]");
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute("href",
      `/api/pdf/owner-statement?accountId=${client.id}&month=2026-09`);
    expect(screen.getByRole("link", { name: "Download CSV" })).toHaveAttribute("href",
      `/api/owner-statement/csv?accountId=${client.id}&month=2026-09`);
  });
  it("shows the action error", async () => {
    mocks.summary.mockResolvedValue({ success: false, error: "You can't see this client." });
    render(<ClientDetail {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Owner statement" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("You can't see this client."));
  });
});
