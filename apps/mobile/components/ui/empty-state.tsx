import { LucideIcon } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { borderRadius, colors, fontSize, spacing } from "../../lib/theme";

interface EmptyStateProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

export function EmptyState({ title, description, icon: Icon }: EmptyStateProps) {
  return (
    <View style={styles.wrapper}>
      <Icon color={colors.textSecondary} size={20} strokeWidth={2} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    textAlign: "center",
  },
});
