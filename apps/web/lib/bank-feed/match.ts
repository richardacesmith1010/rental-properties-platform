import type { BankCharge, BankChoice, BankProperty, BankRow, BankRule, MatchResult, TransferLeg } from "./types";

export function selectableRentCharges<T extends { status: string; deleted_at: string | null }>(items: T[]): T[] {
  return items.filter((item) => item.status !== "waived" && item.deleted_at === null);
}

export function normalizeDescription(value: string): string {
  return value.toUpperCase().replace(/\(CASH\)/g, " ").replace(/\d{5,}/g, " ").replace(/\s+/g, " ").trim();
}

const GENERIC = new Set(
  "ACH CREDIT DEBIT DEPOSIT TRANSFER EFT ELECTRONIC FUNDS PAID PAYMENT POS DIRECT ONLINE WITHDRAWAL CHECK CASH TO FROM DC US"
    .split(" ")
);

export function isSpecificMatchText(value: string): boolean {
  const text = normalizeDescription(value);
  return text.length >= 6 && text.match(/[A-Z]{3,}/g)?.some((word) => !GENERIC.has(word)) === true;
}

function dayGap(first: string, second: string): number {
  return Math.round((Date.parse(second + "T00:00:00Z") - Date.parse(first + "T00:00:00Z")) / 86_400_000);
}

function bestCharge(row: BankRow, charges: BankCharge[], leaseId?: string): BankCharge | undefined {
  return charges.filter((charge) => charge.status !== "waived" && (!leaseId || charge.leaseId === leaseId))
    .filter((charge) => charge.amountCents === row.amountCents && Math.abs(dayGap(charge.dueDate, row.postedOn)) <= 7)
    .sort((a, b) => Math.abs(dayGap(a.dueDate, row.postedOn)) - Math.abs(dayGap(b.dueDate, row.postedOn))
      || a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))[0];
}

const BILL_WORDS: Array<{ test: RegExp; category: BankChoice & { kind: "expense" }; text: string }> = [
  { test: /MORTGAGE/, category: { kind: "expense", propertyId: "", category: "mortgage", label: "Mortgage" },
    text: "Mortgage" },
  { test: /SOLAR/, category: { kind: "expense", propertyId: "", category: "utility", label: "Solar" }, text: "Solar" },
  { test: /WATER|ISPC/, category: { kind: "expense", propertyId: "", category: "utility", label: "Water" }, text: "Water" },
  { test: /PEST/, category: { kind: "expense", propertyId: "", category: "maintenance", label: "Pest control" }, text: "Pest control" },
  { test: /INSURANCE/, category: { kind: "expense", propertyId: "", category: "insurance", label: "Insurance" }, text: "Insurance" },
  { test: /\bHOA\b/, category: { kind: "expense", propertyId: "", category: "hoa", label: "HOA" }, text: "HOA" },
  { test: /PROPERTY TAX|TREASURER/, category: { kind: "expense", propertyId: "",
    category: "property_tax", label: "Property tax" }, text: "Property tax" },
  { test: /PLUMB|HVAC|REPAIR/, category: { kind: "expense", propertyId: "", category: "repair", label: "Repair" }, text: "Repair" }
];

export function classifyRows(input: {
  rows: BankRow[]; bankAccountId: string; rules: BankRule[]; fingerprints: Set<string>;
  charges: BankCharge[]; properties: BankProperty[]; legs: TransferLeg[];
}): MatchResult[] {
  const legs = [...input.legs];
  const usedIncomingRent = new Set<number>();
  const usedOutgoingRent = new Set<number>();
  const usedIncomingTransfer = new Set<number>();
  for (const leg of legs) {
    if (leg.kind !== "transfer" || leg.direction !== "in") continue;
    const rentIndex = legs.findIndex((rent, index) => !usedIncomingRent.has(index) && rent.kind === "rent"
      && rent.bankAccountId !== leg.bankAccountId && rent.amountCents === leg.amountCents
      && dayGap(rent.postedOn, leg.postedOn) >= 0 && dayGap(rent.postedOn, leg.postedOn) <= 10);
    if (rentIndex >= 0) usedIncomingRent.add(rentIndex);
  }
  const rentSuggestion = (row: BankRow): MatchResult => {
    const charge = bestCharge(row, input.charges);
    return { i: row.i, status: "ask", suggestion: charge ? { kind: "rent", rentChargeId: charge.id,
      propertyId: charge.propertyId, text: `Rent from ${charge.tenantName} · ${charge.propertyName}` } : undefined };
  };
  return input.rows.map((row): MatchResult => {
    if (input.fingerprints.has(row.fingerprint)) return { i: row.i, status: "already" };
    const text = normalizeDescription(row.description);
    if (/TRANSFER|EFT|ACH CREDIT|DEPOSIT/.test(text)) {
      const matchingRent = (leg: TransferLeg) => leg.kind === "rent" && leg.amountCents === row.amountCents
        && dayGap(leg.postedOn, row.postedOn) >= 0 && dayGap(leg.postedOn, row.postedOn) <= 10
        && (row.direction === "in" ? leg.bankAccountId !== input.bankAccountId
          : leg.bankAccountId === input.bankAccountId);
      const usedRent = row.direction === "in" ? usedIncomingRent : usedOutgoingRent;
      const availableRentIndex = legs.findIndex((leg, index) => !usedRent.has(index) && matchingRent(leg));
      const rentIndex = availableRentIndex >= 0 ? availableRentIndex : legs.findIndex(matchingRent);
      const incomingIndex = legs.findIndex((leg, index) => !usedIncomingTransfer.has(index)
        && leg.kind === "transfer"
        && leg.direction === "in" && leg.bankAccountId !== input.bankAccountId
        && leg.amountCents === row.amountCents && dayGap(row.postedOn, leg.postedOn) >= 0
        && dayGap(row.postedOn, leg.postedOn) <= 5);
      if (availableRentIndex >= 0 && (row.direction === "in" || incomingIndex >= 0)) {
        if (row.direction === "in") usedIncomingRent.add(availableRentIndex);
        else { usedOutgoingRent.add(availableRentIndex); usedIncomingTransfer.add(incomingIndex); }
        legs.push({ bankAccountId: input.bankAccountId, postedOn: row.postedOn,
          amountCents: row.amountCents, direction: row.direction, kind: "transfer" });
        return { i: row.i, status: "transfer", choice: { kind: "transfer" } };
      }
      if (rentIndex >= 0 && row.direction === "in") return rentSuggestion(row);
      if (rentIndex >= 0 && row.direction === "out") {
        return { i: row.i, status: "ask", suggestion: { text: "Moving rent between your accounts", kind: "transfer" } };
      }
    }
    const rule = input.rules.filter((item) => item.direction === row.direction
      && text.includes(item.match_text) && (!item.bank_account_id || item.bank_account_id === input.bankAccountId))
      .sort((a, b) => Number(b.bank_account_id === input.bankAccountId) - Number(a.bank_account_id === input.bankAccountId)
        || b.match_text.length - a.match_text.length || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0];
    if (rule) {
      if (rule.action === "skip") return { i: row.i, status: "auto", rule };
      if (rule.action === "transfer") return { i: row.i, status: "auto", rule, choice: { kind: "transfer" } };
      if (rule.action === "expense" && rule.property_id && rule.expense_category) {
        return { i: row.i, status: "auto", rule,
          choice: { kind: "expense", propertyId: rule.property_id, category: rule.expense_category, label: rule.label || "Bill" } };
      }
      if (rule.action === "rent") {
        const charge = bestCharge(row, input.charges, rule.lease_id || undefined);
        if (charge && charge.amountCents === row.amountCents) {
          legs.push({ bankAccountId: input.bankAccountId, postedOn: row.postedOn,
            amountCents: row.amountCents, direction: "in", kind: "rent" });
          return { i: row.i, status: "auto", rule, choice: { kind: "rent", rentChargeId: charge.id } };
        }
        return rentSuggestion(row);
      }
    }
    if (row.direction === "in") {
      const suggestion = rentSuggestion(row);
      if (suggestion.suggestion) return suggestion;
    } else {
      const bill = BILL_WORDS.find((word) => word.test.test(text));
      if (bill) {
        const propertyId = input.properties.length === 1 ? input.properties[0].id : null;
        return { i: row.i, status: "ask", suggestion: { kind: "expense", propertyId,
          category: bill.category.category, label: bill.category.label,
          text: propertyId ? `${bill.text} · ${input.properties[0].name}` : bill.text } };
      }
    }
    return { i: row.i, status: "personal" };
  });
}
