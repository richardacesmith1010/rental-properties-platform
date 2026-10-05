import { describe, expect, it } from "vitest";
import { classifyRows, isSpecificMatchText, normalizeDescription } from "@/lib/bank-feed/match";
import type { BankRow, BankRule, TransferLeg } from "@/lib/bank-feed/types";

const charge = { id: "nov", leaseId: "lease", propertyId: "home", propertyName: "1st Home",
  tenantName: "Jane Tenant", dueDate: "2026-11-01", amountCents: 235000, status: "pending" as const };
const row = (description: string, direction: "in" | "out", amountCents = 235000,
  postedOn = "2026-11-05", i = 0): BankRow => ({ i, description, direction, amountCents,
    postedOn, occurrenceIndex: 0, fingerprint: String(i) });
const rentLeg: TransferLeg = { kind: "rent", bankAccountId: "fidelity", postedOn: "2026-11-02",
  amountCents: 235000, direction: "in" };
const input = (rows: BankRow[], legs: TransferLeg[] = [], rules: BankRule[] = []) => ({ rows,
  bankAccountId: "navy", rules, fingerprints: new Set<string>(), charges: [charge],
  properties: [{ id: "home", name: "1st Home" }], legs });

describe("bank matching", () => {
  it("only treats an incoming second leg as a transfer when rent was filed", () => {
    const credit = row("ACH Credit", "in");
    expect(classifyRows(input([credit], [rentLeg]))[0].status).toBe("transfer");
    expect(classifyRows(input([credit]))[0].suggestion?.kind).toBe("rent");
    expect(classifyRows(input([row("DIRECT DEPOSIT JANE TENANT", "in", 235000, "2026-11-02")]))[0]
      .suggestion?.kind).toBe("rent");
  });

  it("requires the incoming leg before skipping an outgoing transfer", () => {
    const out = row("Electronic Funds Transfer Paid", "out");
    const base = { ...input([out], [rentLeg]), bankAccountId: "fidelity" };
    expect(classifyRows(base)[0]).toMatchObject({ status: "ask",
      suggestion: { text: "Moving rent between your accounts" } });
    const incoming: TransferLeg = { kind: "transfer", bankAccountId: "navy",
      postedOn: "2026-11-05", amountCents: 235000, direction: "in" };
    expect(classifyRows({ ...base, legs: [rentLeg, incoming] })[0].status).toBe("transfer");
    expect(classifyRows({ ...base, legs: [] })[0].status).not.toBe("transfer");
  });

  it("uses each rent item for only one incoming transfer", () => {
    const rows = [row("DEPOSIT", "in", 235000, "2026-11-05", 0),
      row("DEPOSIT", "in", 235000, "2026-11-06", 1)];
    expect(classifyRows(input(rows, [rentLeg])).map((item) => [item.status, item.suggestion?.kind]))
      .toEqual([["transfer", undefined], ["ask", "rent"]]);
  });

  it("counts a stored incoming transfer as using its rent evidence", () => {
    const incoming: TransferLeg = { kind: "transfer", bankAccountId: "navy",
      postedOn: "2026-11-05", amountCents: 235000, direction: "in" };
    expect(classifyRows(input([row("DEPOSIT", "in")], [rentLeg, incoming]))[0])
      .toMatchObject({ status: "ask", suggestion: { kind: "rent" } });
  });

  it("uses an incoming leg for only one outgoing transfer", () => {
    const incoming: TransferLeg = { kind: "transfer", bankAccountId: "navy",
      postedOn: "2026-11-05", amountCents: 235000, direction: "in" };
    const rows = [row("EFT", "out", 235000, "2026-11-04", 0),
      row("EFT", "out", 235000, "2026-11-04", 1)];
    const result = classifyRows({ ...input(rows, [rentLeg, incoming]), bankAccountId: "fidelity" });
    expect(result.map((item) => item.status)).toEqual(["transfer", "ask"]);
  });

  it("suggests another qualifying rent when a rent rule has no matching charge", () => {
    const rule: BankRule = { id: "rule", bank_account_id: "navy", direction: "in",
      match_text: "DIRECT DEPOSIT JANE TENANT", action: "rent", lease_id: "old-lease",
      property_id: null, expense_category: null, label: null, created_at: "2026-01-01" };
    const result = classifyRows(input([row("DIRECT DEPOSIT JANE TENANT", "in")], [], [rule]));
    expect(result[0]).toMatchObject({ status: "ask", suggestion: { kind: "rent", rentChargeId: "nov" } });
  });

  it("puts transfers before rules and already before transfers", () => {
    const rule: BankRule = { id: "rule", bank_account_id: null, direction: "in", match_text: "ACH CREDIT",
      action: "rent", lease_id: "lease", property_id: null, expense_category: null, label: null,
      created_at: "2026-01-01" };
    const credit = row("ACH Credit", "in");
    expect(classifyRows(input([credit], [rentLeg], [rule]))[0].status).toBe("transfer");
    expect(classifyRows({ ...input([credit], [rentLeg], [rule]),
      charges: [{ ...charge, status: "paid" }] })[0].status).toBe("transfer");
    expect(classifyRows({ ...input([credit], [rentLeg]), fingerprints: new Set([credit.fingerprint]) })[0].status)
      .toBe("already");
    expect(classifyRows(input([row("ACH Credit", "in", 230000)], [], [rule]))[0].status).toBe("ask");
  });

  it("chooses account rules, then longest text, then oldest", () => {
    const makeRule = (id: string, bank_account_id: string | null, match_text: string, created_at: string): BankRule => ({
      id, bank_account_id, match_text, created_at, direction: "out", action: "expense", lease_id: null,
      property_id: "home", expense_category: "mortgage", label: id
    });
    const rules = [makeRule("global", null, "MORTGAGE", "2020-01-01"),
      makeRule("short", "navy", "MORTGAGE", "2021-01-01"),
      makeRule("long", "navy", "TRANSFER TO MORTGAGE", "2022-01-01")];
    const mortgage = row("Transfer To Mortgage", "out", 103944, "2026-10-01");
    expect(classifyRows(input([mortgage], [], rules.slice(0, 2)))[0].rule?.id).toBe("short");
    expect(classifyRows(input([mortgage], [], rules))[0].rule?.id).toBe("long");
    const tie = makeRule("old", "navy", "TRANSFER TO MORTGAGE", "2021-01-01");
    expect(classifyRows(input([mortgage], [], [...rules, tie]))[0].rule?.id).toBe("old");
    const twice = [mortgage, { ...mortgage, i: 1, fingerprint: "1", postedOn: "2026-10-15" }];
    expect(classifyRows(input(twice, [], rules)).map((item) => item.status)).toEqual(["auto", "auto"]);
  });

  it("suggests known bills and never treats outgoing lookalikes as rent", () => {
    const cases: Array<[string, string, string]> = [
      ["Transfer To Mortgage", "mortgage", "Mortgage"], ["Payment to Solar Servicing", "utility", "Solar"],
      ["- Ispc XX0028", "utility", "Water"], ["Py *magna Pest Sol", "maintenance", "Pest control"]
    ];
    for (const [text, category, label] of cases) {
      expect(classifyRows(input([row(text, "out", 10000)]))[0].suggestion)
        .toMatchObject({ kind: "expense", category, label });
    }
    expect(classifyRows(input([row("Rps*cortland", "out", 228007)]))[0].status).toBe("personal");
    expect(classifyRows(input([row("Payment to xfinity", "out", 8181)]))[0].status).toBe("personal");
  });

  it("requires specific payee text", () => {
    expect(isSpecificMatchText("ACH CREDIT")).toBe(false);
    expect(isSpecificMatchText("ELECTRONIC FUNDS TRANSFER PAID")).toBe(false);
    expect(isSpecificMatchText("TRANSFER TO MORTGAGE")).toBe(true);
    expect(isSpecificMatchText("- ISPC XX0028")).toBe(true);
    expect(normalizeDescription(" paid (Cash) 123456 abc ")).toBe("PAID ABC");
  });
});
