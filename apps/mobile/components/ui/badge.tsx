import { StyleSheet, Text, View } from "react-native";
import { borderRadius, colors, fontSize, spacing } from "../../lib/theme";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

function getVariantBackground(variant: BadgeVariant) {
  switch (variant) {
    case "success":
      return colors.success;
    case "warning":
      return colors.warning;
    case "danger":
      return colors.danger;
    case "info":
      return colors.info;
    default:
      return colors.surfaceBorder;
  }
}

export function Badge({ label, variant = "default" }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: getVariantBackground(variant) }]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  text: {
    color: colors.primaryText,
    fontSize: fontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
});
