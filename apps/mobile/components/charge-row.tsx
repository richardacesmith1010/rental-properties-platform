import { StyleSheet, Text, View } from "react-native";
import type { MobileChargeDTO } from "../lib/types";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { colors, fontSize, spacing } from "../lib/theme";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ChargeRow({ charge }: { charge: MobileChargeDTO }) {
  return (
    <Card>
      <View style={styles.headerRow}>
        <Text style={styles.property}>{charge.propertyLabel}</Text>
        <Badge label={charge.status} variant={charge.status === "late" ? "danger" : "warning"} />
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>Due {formatDate(charge.dueDate)}</Text>
        <Text style={styles.amount}>{formatCurrency(charge.amountCents)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  property: {
    color: colors.text,
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: "700",
    marginRight: spacing.sm,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  meta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  amount: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: "800",
  },
});
