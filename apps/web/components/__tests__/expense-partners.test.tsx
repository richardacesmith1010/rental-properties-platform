import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExpenseList } from "@/components/dashboard/expenses/expense-list";
import { ExpenseForm } from "@/components/dashboard/expenses/expense-form";
import type { ExpenseDashboardData } from "@/lib/expenses";

const partner = { id: "partner", accountId: "llc", displayName: "Alice", active: true, profileId: null };
const base: ExpenseDashboardData = { enabled: true, warning: null,
  properties: [{ id: "home", name: "Home" }], expenses: [], pnlByProperty: [],
  monthlyByProperty: {}, categoryByProperty: {},
  partnerAccounts: { home: { accountId: "llc", partners: [partner,
    { id: "old", accountId: "llc", displayName: "Inactive", active: false, profileId: null }] } } };
const props = { vendors: [], propertyFiles: [], onCreateExpense: vi.fn(),
  onAddPartner: vi.fn(), onSetPaidBy: vi.fn() };
function advanceToReview(container: HTMLElement) {
  fireEvent.click(screen.getByTitle("Complete this step and move to the next step."));
  fireEvent.click(screen.getByTitle("Complete this step and move to the next step."));
  fireEvent.change(container.querySelector('input[type="number"]')!, { target: { value: "100" } });
  fireEvent.click(screen.getByTitle("Complete this step and move to the next step."));
  fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: "2026-10-12" } });
  fireEvent.click(screen.getByTitle("Complete this step and move to the next step."));
  fireEvent.click(screen.getByTitle("Complete this step and move to the next step."));
  for (let index = 0; index < 3; index += 1) fireEvent.click(screen.getByTitle("Skip this optional step for now and continue."));
}
describe("expense payer flow", () => {
  it("shows Who paid only for LLC owners and only active partners", () => {
    const { container, rerender } = render(<ExpenseForm data={base} {...props} />);
    advanceToReview(container);
    expect(screen.getByText("Who paid?")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.queryByText("Inactive")).toBeNull();
    rerender(<ExpenseForm data={{ ...base, partnerAccounts: {} }} {...props} />);
    expect(screen.queryByText("Who paid?")).toBeNull();
  });
  it("adds a person and selects the new partner", async () => {
    props.onAddPartner.mockResolvedValue({ ok: true, data: { id: "new" } });
    const { container } = render(<ExpenseForm data={base} {...props} />);
    advanceToReview(container);
    fireEvent.change(screen.getByLabelText("Who paid?"), { target: { value: "add" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Yani" } });
    fireEvent.click(screen.getByTitle("Save new person"));
    await waitFor(() => expect(screen.getByLabelText("Who paid?")).toHaveProperty("value", "new"));
    expect(props.onAddPartner).toHaveBeenCalledWith("llc", "Yani");
  });
  it("preselects the saved payer and does not clear it on an unchanged edit", async () => {
    const onUpdateExpense = vi.fn().mockResolvedValue({ success: true });
    const onSetPaidBy = vi.fn();
    const expense: ExpenseDashboardData["expenses"][number] = { id: "bill", propertyId: "home",
      propertyName: "Home", category: "repair", description: null, amountCents: 100,
      expenseDate: "2026-10-12", recurring: false, recurringFrequency: null, vendorId: null,
      vendorName: null, receiptFileId: null, createdAt: "2026-10-12", paidById: "partner", paidByName: "Alice" };
    render(<ExpenseList data={{ ...base, expenses: [expense] }} vendors={[]} propertyFiles={[]}
      onUpdateExpense={onUpdateExpense} onDeleteExpense={vi.fn()} onSetPaidBy={onSetPaidBy} />);
    expect(screen.getByText("Paid by Alice")).toBeTruthy();
    fireEvent.click(screen.getByTitle("Open expense edit controls."));
    expect(screen.getByLabelText("Who paid?")).toHaveProperty("value", "partner");
    fireEvent.click(screen.getByTitle("Save updates to this expense."));
    await waitFor(() => expect(onUpdateExpense).toHaveBeenCalledTimes(1));
    expect(onSetPaidBy).not.toHaveBeenCalled();
  });
  it("saves one bill and retries only attribution after a failure", async () => {
    props.onCreateExpense.mockResolvedValue({ success: true, expenseId: "expense" });
    props.onSetPaidBy.mockResolvedValueOnce({ ok: false, error: "failed" }).mockResolvedValueOnce({ ok: true });
    const { container } = render(<ExpenseForm data={base} {...props} />);
    advanceToReview(container);
    fireEvent.change(screen.getByLabelText("Who paid?"), { target: { value: "partner" } });
    fireEvent.click(screen.getByTitle("Create this expense record."));
    await waitFor(() => expect(screen.getByTitle("Retry saving who paid")).toBeTruthy());
    fireEvent.click(screen.getByTitle("Retry saving who paid"));
    await waitFor(() => expect(props.onSetPaidBy).toHaveBeenCalledTimes(2));
    expect(props.onCreateExpense).toHaveBeenCalledTimes(1);
    expect(props.onSetPaidBy).toHaveBeenLastCalledWith("expense", "partner");
  });
});
