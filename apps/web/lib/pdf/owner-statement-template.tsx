import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { OwnerStatement } from "@/lib/owner-statement";
import { madeDate } from "@/lib/statement-month";

const s = StyleSheet.create({
  page: { padding: 36, paddingBottom: 55, fontFamily: "Helvetica", fontSize: 9, color: "#20252b" },
  brand: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 12 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  muted: { color: "#666d75" },
  totals: { flexDirection: "row", marginTop: 20, marginBottom: 18, gap: 8 },
  total: { width: "25%", backgroundColor: "#f1f2f4", padding: 8, borderRadius: 4 },
  totalValue: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 5 },
  section: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 5 },
  row: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  header: { backgroundColor: "#eef0f2", fontFamily: "Helvetica-Bold" },
  cell: { flexGrow: 1, flexBasis: 0, paddingRight: 5 },
  amount: { width: 78, textAlign: "right" },
  footer: { position: "absolute", left: 36, right: 36, bottom: 23, fontSize: 8, color: "#666d75" },
  pageNumber: { position: "absolute", right: 36, bottom: 10, fontSize: 8, color: "#666d75" }
});
export const formatStatementMoney = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", {
  minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function Table({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  const groups: string[][][] = [];
  for (let index = 0; index < rows.length; index += 12) groups.push(rows.slice(index, index + 12));
  if (!groups.length) groups.push([]);
  return <View>{groups.map((group, groupIndex) => <View key={groupIndex} wrap={false}>
    <Text style={s.section}>{title}</Text>
    <View style={[s.row, s.header]}>{headers.map((cell, index) =>
      <Text key={index} style={index === headers.length - 1 ? s.amount : s.cell}>{cell}</Text>)}</View>
    {group.length ? group.map((row, index) => <View key={index} style={s.row}>
      {row.map((cell, column) => <Text key={column} style={column === row.length - 1 ? s.amount : s.cell}>{cell}</Text>)}
    </View>) : <Text style={[s.row, s.muted]}>None this month.</Text>}
  </View>)}</View>;
}
export function OwnerStatementDocument({ statement }: { statement: OwnerStatement }) {
  const { totals } = statement;
  return <Document><Page size="LETTER" style={s.page} wrap>
    <Text style={s.brand}>DOMUS</Text>
    <Text style={s.title}>Owner statement</Text>
    <Text>{statement.account.name} · {statement.periodLabel}</Text>
    <Text style={s.muted}>Prepared by {statement.preparedBy.name} · {statement.preparedBy.email}</Text>
    <View style={s.totals}>{([
      ["Payments recorded", totals.paymentsCents], ["Expenses", totals.expensesCents],
      ["Net", totals.netCents], ["Still owed", totals.stillOwedCents]
    ] as const).map(([label, value]) => <View key={label} style={s.total}>
      <Text>{label}</Text><Text style={s.totalValue}>{formatStatementMoney(value)}</Text>
    </View>)}</View>
    <Table title="By home" headers={["Home", "Payments", "Expenses", "Net"]}
      rows={[...statement.homes.map((row) => [row.name, formatStatementMoney(row.paymentsCents),
        formatStatementMoney(row.expensesCents), formatStatementMoney(row.netCents)]),
      ["Total", formatStatementMoney(totals.paymentsCents), formatStatementMoney(totals.expensesCents), formatStatementMoney(totals.netCents)]]} />
    <Table title="Payments recorded" headers={["Date", "Home", "Tenant", "Kind", "Method", "Amount"]}
      rows={statement.payments.map((row) => [row.date, row.homeLabel, row.tenantLabel, row.kindLabel,
        row.methodLabel, formatStatementMoney(row.amountCents)])} />
    <Table title="Expenses" headers={["Date", "Home", "Kind", "Note", "Amount"]}
      rows={statement.expenses.map((row) => [row.date, row.homeLabel, row.kindLabel, row.note, formatStatementMoney(row.amountCents)])} />
    <Table title="Not counted" headers={["Date", "Home", "Kind", "Amount"]}
      rows={statement.notCounted.map((row) => [row.date, row.homeLabel, row.label, formatStatementMoney(row.amountCents)])} />
    <Table title="Still owed" headers={["Due", "Home", "Amount"]}
      rows={statement.owed.map((row) => [row.dueDate, row.homeLabel, formatStatementMoney(row.amountCents)])} />
    <Text style={s.footer} fixed>Rent for these homes is paid outside Domus. Made {madeDate(statement.generatedAt)} from your
      manager&apos;s records. Later fixes to records can change this statement.</Text>
    <Text style={s.pageNumber} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
  </Page></Document>;
}
