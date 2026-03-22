import type { ChargeDetailRecordDTO } from "@/lib/charge-audit";
import { describe, expect, it } from "vitest";
import {
  bucketDelinquencyDays,
  mapExpenseCategoryToTaxField
} from "../reports";
import {
  delinquencyToCsv,
  monthlyPnlToCsv,
  receivablesToCsv,
  rentRollToCsv,
  taxSummaryToCsv,
  tenantLedgerToCsv
} from "../csv-export-reports";

describe("bucketDelinquencyDays", () => {
  it("uses current for 0-30 day balances", () => {
    expect(bucketDelinquencyDays(0)).toBe("current");
    expect(bucketDelinquencyDays(30)).toBe("current");
  });

  it("uses current for negative delinquency values", () => {
    expect(bucketDelinquencyDays(-5)).toBe("current");
  });

  it("uses thirtyDay for 31-60 day balances", () => {
    expect(bucketDelinquencyDays(31)).toBe("thirtyDay");
    expect(bucketDelinquencyDays(60)).toBe("thirtyDay");
  });

  it("uses sixtyDay for 61-90 day balances", () => {
    expect(bucketDelinquencyDays(61)).toBe("sixtyDay");
    expect(bucketDelinquencyDays(90)).toBe("sixtyDay");
  });

  it("uses ninetyPlus for 91+ day balances", () => {
    expect(bucketDelinquencyDays(91)).toBe("ninetyPlus");
    expect(bucketDelinquencyDays(180)).toBe("ninetyPlus");
  });
});

describe("mapExpenseCategoryToTaxField", () => {
  it("maps mortgage expenses", () => {
    expect(mapExpenseCategoryToTaxField("mortgage")).toBe("mortgageInterest");
  });

  it("maps insurance expenses", () => {
    expect(mapExpenseCategoryToTaxField("insurance")).toBe("insurance");
  });

  it("maps management fees", () => {
    expect(mapExpenseCategoryToTaxField("management_fee")).toBe("managementFees");
  });

  it("maps legal expenses", () => {
    expect(mapExpenseCategoryToTaxField("legal")).toBe("legalAndProfessional");
  });

  it("maps property taxes", () => {
    expect(mapExpenseCategoryToTaxField("property_tax")).toBe("taxes");
  });

  it("maps utility expenses", () => {
    expect(mapExpenseCategoryToTaxField("utility")).toBe("utilities");
  });

  it("maps maintenance to cleaning and maintenance", () => {
    expect(mapExpenseCategoryToTaxField("maintenance")).toBe("cleaningAndMaintenance");
  });

  it("maps repair expenses", () => {
    expect(mapExpenseCategoryToTaxField("repair")).toBe("repairs");
  });

  it("falls back unknown categories to other expenses", () => {
    expect(mapExpenseCategoryToTaxField("hoa")).toBe("otherExpenses");
  });
});

describe("report csv exporters", () => {
  const baseChargeDetails: ChargeDetailRecordDTO[] = [];

  it("builds rent roll csv", () => {
    const csv = rentRollToCsv([
      {
        leaseId: "lease-1",
        propertyId: "property-1",
        tenantProfileId: "tenant-1",
        propertyName: "Atlas",
        unitNumber: "101",
        tenantName: "Maya",
        tenantEmail: "maya@example.com",
        monthlyRentCents: 150000,
        leaseStart: "2026-01-01",
        leaseEnd: "2026-12-31",
        leaseStatus: "active",
        currentBalance: 5000,
        lastPaymentDate: "2026-02-01",
        chargeDetails: baseChargeDetails
      }
    ]);

    expect(csv).toContain('"Property"');
    expect(csv).toContain('"Atlas"');
    expect(csv).toContain('"1500.00"');
  });

  it("builds rent roll csv rows for vacant units", () => {
    const csv = rentRollToCsv([
      {
        leaseId: "lease-2",
        propertyId: "property-1",
        tenantProfileId: null,
        propertyName: "Atlas",
        unitNumber: "102",
        tenantName: null,
        tenantEmail: null,
        monthlyRentCents: 0,
        leaseStart: "",
        leaseEnd: "",
        leaseStatus: "vacant",
        currentBalance: 0,
        lastPaymentDate: null,
        chargeDetails: baseChargeDetails
      }
    ]);

    expect(csv).toContain('"vacant"');
    expect(csv).toContain('""');
  });

  it("builds delinquency csv", () => {
    const csv = delinquencyToCsv([
      {
        leaseId: "lease-1",
        tenantProfileId: "tenant-1",
        tenantName: "Maya",
        tenantEmail: "maya@example.com",
        propertyName: "Atlas",
        unitNumber: "101",
        current: 1000,
        thirtyDay: 2000,
        sixtyDay: 3000,
        ninetyPlus: 4000,
        totalOwed: 10000,
        chargeDetails: baseChargeDetails
      }
    ]);

    expect(csv).toContain('"0-30 ($)"');
    expect(csv).toContain('"100.00"');
  });

  it("builds delinquency csv with zero balances", () => {
    const csv = delinquencyToCsv([
      {
        leaseId: "lease-2",
        tenantProfileId: "tenant-2",
        tenantName: "Paid In Full",
        tenantEmail: "paid@example.com",
        propertyName: "Atlas",
        unitNumber: "101",
        current: 0,
        thirtyDay: 0,
        sixtyDay: 0,
        ninetyPlus: 0,
        totalOwed: 0,
        chargeDetails: baseChargeDetails
      }
    ]);

    expect(csv).toContain('"0.00"');
  });

  it("builds tenant ledger csv", () => {
    const csv = tenantLedgerToCsv([
      {
        tenantName: "Maya",
        tenantEmail: "maya@example.com",
        totalCharges: 10000,
        totalPayments: 5000,
        currentBalance: 5000,
        entries: [
          {
            date: "2026-01-01",
            type: "charge",
            description: "Rent charge posted",
            amount: 10000,
            balance: 10000,
            propertyName: "Atlas",
            unitNumber: "101"
          }
        ]
      }
    ]);

    expect(csv).toContain('"Rent charge posted"');
    expect(csv).toContain('"100.00"');
  });

  it("builds tenant ledger csv with multiple transactions", () => {
    const csv = tenantLedgerToCsv([
      {
        tenantName: "Maya",
        tenantEmail: "maya@example.com",
        totalCharges: 15000,
        totalPayments: 5000,
        currentBalance: 10000,
        entries: [
          {
            date: "2026-01-01",
            type: "charge",
            description: "January rent",
            amount: 10000,
            balance: 10000,
            propertyName: "Atlas",
            unitNumber: "101"
          },
          {
            date: "2026-01-02",
            type: "payment",
            description: "Payment received",
            amount: -5000,
            balance: 5000,
            propertyName: "Atlas",
            unitNumber: "101"
          }
        ]
      }
    ]);

    expect(csv.split("\n")).toHaveLength(3);
    expect(csv).toContain('"Payment received"');
    expect(csv).toContain('"-50.00"');
  });

  it("builds monthly pnl csv", () => {
    const csv = monthlyPnlToCsv([
      {
        month: "2026-01",
        propertyId: "property-1",
        propertyName: "Atlas",
        rentalIncome: 100000,
        lateFeeIncome: 5000,
        totalIncome: 105000,
        expenses: 40000,
        netIncome: 65000,
        incomeLineItems: baseChargeDetails,
        expenseLineItems: []
      }
    ]);

    expect(csv).toContain('"Month"');
    expect(csv).toContain('"1050.00"');
  });

  it("builds monthly pnl csv with zero income months", () => {
    const csv = monthlyPnlToCsv([
      {
        month: "2026-02",
        propertyId: "property-1",
        propertyName: "Atlas",
        rentalIncome: 0,
        lateFeeIncome: 0,
        totalIncome: 0,
        expenses: 40000,
        netIncome: -40000,
        incomeLineItems: baseChargeDetails,
        expenseLineItems: []
      }
    ]);

    expect(csv).toContain('"0.00"');
    expect(csv).toContain('"-400.00"');
  });

  it("builds monthly pnl csv with zero expense months", () => {
    const csv = monthlyPnlToCsv([
      {
        month: "2026-03",
        propertyId: "property-1",
        propertyName: "Atlas",
        rentalIncome: 100000,
        lateFeeIncome: 0,
        totalIncome: 100000,
        expenses: 0,
        netIncome: 100000,
        incomeLineItems: baseChargeDetails,
        expenseLineItems: []
      }
    ]);

    expect(csv).toContain('"1000.00"');
  });

  it("builds tax summary csv", () => {
    const csv = taxSummaryToCsv([
      {
        propertyName: "Atlas",
        propertyAddress: "123 Main",
        totalRentalIncome: 120000,
        advertisingExpenses: 0,
        autoAndTravel: 0,
        cleaningAndMaintenance: 1000,
        commissions: 0,
        insurance: 2000,
        legalAndProfessional: 3000,
        managementFees: 4000,
        mortgageInterest: 5000,
        repairs: 6000,
        supplies: 0,
        taxes: 7000,
        utilities: 8000,
        otherExpenses: 9000,
        totalExpenses: 45000,
        netIncome: 75000
      }
    ]);

    expect(csv).toContain('"123 Main"');
    expect(csv).toContain('"750.00"');
  });

  it("includes every Schedule E expense column in tax summary csv", () => {
    const csv = taxSummaryToCsv([
      {
        propertyName: "Atlas",
        propertyAddress: "123 Main",
        totalRentalIncome: 0,
        advertisingExpenses: 1,
        autoAndTravel: 2,
        cleaningAndMaintenance: 3,
        commissions: 4,
        insurance: 5,
        legalAndProfessional: 6,
        managementFees: 7,
        mortgageInterest: 8,
        repairs: 9,
        supplies: 10,
        taxes: 11,
        utilities: 12,
        otherExpenses: 13,
        totalExpenses: 91,
        netIncome: -91
      }
    ]);

    expect(csv).toContain('"Advertising ($)"');
    expect(csv).toContain('"Auto/Travel ($)"');
    expect(csv).toContain('"Other ($)"');
  });

  it("builds receivables csv", () => {
    const csv = receivablesToCsv([
      {
        leaseId: "lease-1",
        tenantProfileId: "tenant-1",
        tenantName: "Maya",
        tenantEmail: "maya@example.com",
        propertyName: "Atlas",
        chargeCount: 2,
        totalOwedCents: 25000,
        oldestDueDate: "2026-01-01",
        chargeDetails: baseChargeDetails
      }
    ]);

    expect(csv).toContain('"Charge Count"');
    expect(csv).toContain('"250.00"');
  });

  it("escapes commas inside csv values", () => {
    const csv = rentRollToCsv([
      {
        leaseId: "lease-3",
        propertyId: "property-2",
        tenantProfileId: "tenant-1",
        propertyName: "Atlas, East",
        unitNumber: "101",
        tenantName: "Maya",
        tenantEmail: "maya@example.com",
        monthlyRentCents: 150000,
        leaseStart: "2026-01-01",
        leaseEnd: "2026-12-31",
        leaseStatus: "active",
        currentBalance: 0,
        lastPaymentDate: "2026-01-01",
        chargeDetails: baseChargeDetails
      }
    ]);

    expect(csv).toContain('"Atlas, East"');
  });

  it("escapes quotes inside csv values", () => {
    const csv = rentRollToCsv([
      {
        leaseId: "lease-4",
        propertyId: "property-3",
        tenantProfileId: "tenant-1",
        propertyName: 'The "Atlas" Building',
        unitNumber: "101",
        tenantName: "Maya",
        tenantEmail: "maya@example.com",
        monthlyRentCents: 150000,
        leaseStart: "2026-01-01",
        leaseEnd: "2026-12-31",
        leaseStatus: "active",
        currentBalance: 0,
        lastPaymentDate: "2026-01-01",
        chargeDetails: baseChargeDetails
      }
    ]);

    expect(csv).toContain('"The ""Atlas"" Building"');
  });

  it("still returns headers when report data is empty", () => {
    expect(rentRollToCsv([])).toBe(
      '"Property","Unit","Tenant","Tenant Email","Monthly Rent ($)","Lease Start","Lease End","Status","Current Balance ($)","Last Payment"'
    );
    expect(receivablesToCsv([])).toBe(
      '"Tenant","Email","Property","Charge Count","Total Owed ($)","Oldest Due Date"'
    );
  });
});
