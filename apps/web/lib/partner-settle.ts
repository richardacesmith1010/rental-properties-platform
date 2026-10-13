import type { PartnerLine } from "./partners";

export type SettleUpSuggestion = {
  fromPartnerId: string; fromName: string; toPartnerId: string; toName: string; amountCents: number;
};

export function suggestEvenSettleUp(rows: PartnerLine[]): SettleUpSuggestion[] {
  const partners = rows.filter((row): row is PartnerLine & { id: string } => row.id !== null && row.active)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  if (partners.length < 2) return [];

  const total = partners.reduce((sum, row) => sum + row.projectedPutIn, 0);
  const floor = Math.floor(total / partners.length);
  const remainder = total - floor * partners.length;
  const balances = partners.map((row, index) => ({
    id: row.id, name: row.name, difference: row.projectedPutIn - floor - (index < remainder ? 1 : 0)
  }));
  if (balances.every((row) => Math.abs(row.difference) <= 100)) return [];

  const byAmountThenName = (a: typeof balances[number], b: typeof balances[number]) =>
    Math.abs(b.difference) - Math.abs(a.difference)
      || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  const debtors = balances.filter((row) => row.difference < 0);
  const creditors = balances.filter((row) => row.difference > 0);
  const suggestions: SettleUpSuggestion[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort(byAmountThenName);
    creditors.sort(byAmountThenName);
    const debtor = debtors[0];
    const creditor = creditors[0];
    const amountCents = Math.min(-debtor.difference, creditor.difference);
    suggestions.push({ fromPartnerId: debtor.id, fromName: debtor.name,
      toPartnerId: creditor.id, toName: creditor.name, amountCents });
    debtor.difference += amountCents;
    creditor.difference -= amountCents;
    if (debtor.difference === 0) debtors.shift();
    if (creditor.difference === 0) creditors.shift();
  }
  return suggestions;
}
