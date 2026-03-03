import { LucideIcon } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "./ui/card";
import { colors, fontSize, spacing } from "../lib/theme";

interface KpiCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
}

export function KpiCard({ label, value, icon: Icon }: KpiCardProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        {Icon ? <Icon color={colors.primary} size={16} strokeWidth={2} /> : null}
      </View>
      <Text style={styles.value}>{value}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  value: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: "800",
  },
});
