import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, spacing } from "../../lib/theme";

interface LoadingSpinnerProps {
  label?: string;
}

export function LoadingSpinner({ label = "Loading..." }: LoadingSpinnerProps) {
  return (
    <View style={styles.wrapper}>
      <ActivityIndicator color={colors.primary} size="small" />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    gap: spacing.sm,
    justifyContent: "center",
    paddingVertical: spacing.xl,
  },
  label: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
});
