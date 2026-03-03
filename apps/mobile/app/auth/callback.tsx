import { useRouter } from "expo-router";
import { useEffect } from "react";
import { SafeAreaView, StyleSheet, Text } from "react-native";
import { LoadingSpinner } from "../../components/ui/loading-spinner";
import { useAuth } from "../../lib/auth-context";
import { colors, fontSize, spacing } from "../../lib/theme";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { session, isLoading, authMessage } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (session) {
      router.replace("/(tabs)");
      return;
    }

    router.replace("/login");
  }, [isLoading, router, session]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <LoadingSpinner label="Finishing sign-in..." />
      {authMessage ? <Text style={styles.message}>{authMessage}</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  message: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    textAlign: "center",
  },
});
