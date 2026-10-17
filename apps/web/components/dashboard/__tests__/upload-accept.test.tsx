import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExpenseForm } from "@/components/dashboard/expenses/expense-form";
import { ExpenseList } from "@/components/dashboard/expenses/expense-list";
import { SignerFlow } from "@/components/dashboard/documents/signer-flow";
import type { ExpenseDashboardData } from "@/lib/expenses";

const action = async () => ({ success: true as const });
const data: ExpenseDashboardData = {
  enabled: true, warning: null, properties: [{ id: "home-a", name: "Home A" }],
  expenses: [{ id: "expense-a", propertyId: "home-a", propertyName: "Home A", category: "repair",
    description: null, amountCents: 1000, expenseDate: "2026-10-16", recurring: false,
    recurringFrequency: null, vendorId: null, vendorName: null, receiptFileId: null, createdAt: "2026-10-16" }],
  pnlByProperty: [], monthlyByProperty: {}, categoryByProperty: {}
};

describe("upload input types", () => {
  it("limits new expense receipts to images and PDFs", () => {
    render(<ExpenseForm data={data} vendors={[]} propertyFiles={[]} onCreateExpense={action} />);
    const next = screen.getByRole("button", { name: "Next" });
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.change(screen.getByPlaceholderText("Amount (USD)"), { target: { value: "10" } });
    fireEvent.click(next);
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: "2026-10-16" } });
    for (let index = 0; index < 5; index += 1) fireEvent.click(next);
    expect(document.querySelector('input[name="receiptFile"]')).toHaveAttribute("accept",
      "image/jpeg,image/png,image/webp,application/pdf");
  });

  it("limits edited expense receipts to images and PDFs", () => {
    render(<ExpenseList data={data} vendors={[]} propertyFiles={[]} onUpdateExpense={action} onDeleteExpense={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    expect(document.querySelector('input[name="receiptFile"]')).toHaveAttribute("accept",
      "image/jpeg,image/png,image/webp,application/pdf");
  });

  it("offers images, PDFs, and documents for signer uploads", () => {
    render(<SignerFlow properties={[{ id: "home-a", name: "Home A" }]} onCancel={() => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "home-a" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "lease_agreement" } });
    for (let index = 0; index < 3; index += 1) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(document.querySelector('input[name="file"]')).toHaveAttribute("accept",
      "image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt");
  });
});
