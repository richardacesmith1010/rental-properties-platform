import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { borderRadius, colors, fontSize, spacing } from "../../lib/theme";

type ButtonVariant = "primary" | "secondary" | "destructive";

interface ButtonProps {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  style?: ViewStyle;
}

function getVariantStyles(variant: ButtonVariant) {
  switch (variant) {
    case "secondary":
      return {
        backgroundColor: colors.surface,
        borderColor: colors.primary,
        textColor: colors.primary,
      };
    case "destructive":
      return {
        backgroundColor: colors.danger,
        borderColor: colors.danger,
        textColor: colors.primaryText,
      };
    default:
      return {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
        textColor: colors.primaryText,
      };
  }
}

export function Button({
  children,
  onPress,
  disabled = false,
  variant = "primary",
  style,
}: ButtonProps) {
  const variantStyles = getVariantStyles(variant);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: variantStyles.backgroundColor,
          borderColor: variantStyles.borderColor,
        },
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <Text style={[styles.text, { color: variantStyles.textColor }]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: borderRadius.md,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: {
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.55,
  },
});
