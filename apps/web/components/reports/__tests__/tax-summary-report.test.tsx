import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaxSummaryReport } from "../tax-summary-report";
import type { TaxSummaryRow } from "@/lib/reports";

const row: TaxSummaryRow = {
  propertyId: "home-1", propertyName: "Atlas", propertyAddress: "123 Main",
  totalRentalIncome: 2000000, advertisingExpenses: 0, autoAndTravel: 0,
  cleaningAndMaintenance: 0, commissions: 0, insurance: 0, legalAndProfessional: 0,
  managementFees: 0, mortgageInterest: 700000, mortgagePaymentsCashFlow: 1200000,
  depreciation: 50000, escrowPropertyTax: 30000, escrowInsurance: 40000,
  needsInputs: true, repairs: 0, supplies: 0, taxes: 0, utilities: 0,
  otherExpenses: 0, totalExpenses: 750000, netIncome: 1250000
};

describe("Rental tax summary", () => {
  it("shows interest, depreciation, saved values, warning and guidance", () => {
    render(<TaxSummaryReport data={[row]} year={2026} onSave={vi.fn()} />);
    expect(screen.getByText("Mortgage interest")).toBeTruthy();
    expect(screen.getByText("Depreciation")).toBeTruthy();
    expect(screen.getByText("Add Form 1098 interest")).toBeTruthy();
    expect(screen.getByText(/Mortgage payments are cash flow/)).toBeTruthy();
    expect(screen.getByText(/Domus does not give tax advice/)).toBeTruthy();
    expect(screen.getByLabelText("Mortgage interest (Form 1098)")).toHaveProperty("value", "7000.00");
    expect(screen.getByLabelText("Depreciation (from your tax preparer)")).toHaveProperty("value", "500.00");
    expect(screen.getByText("Only enter amounts your lender paid. Don't also add them as expenses.")).toBeTruthy();
  });
});
