import { Slot, usePathname, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { LoadingSpinner } from "../components/ui/loading-spinner";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { colors, fontSize, spacing } from "../lib/theme";

void SplashScreen.preventAutoHideAsync();

function RootGate() {
  const router = useRouter();
  const pathname = usePathname();
  const { isConfigured, isLoading, session } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    void SplashScreen.hideAsync();

    const onAuthRoute = pathname === "/login" || pathname.startsWith("/auth/");
    if (!session && !onAuthRoute) {
      router.replace("/login");
      return;
    }

    if (session && onAuthRoute) {
      router.replace("/(tabs)");
    }
  }, [isLoading, pathname, router, session]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LoadingSpinner label="Loading mobile workspace..." />
      </SafeAreaView>
    );
  }

  if (!isConfigured) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.configCard}>
          <Text style={styles.configTitle}>Missing Mobile Environment</Text>
          <Text style={styles.configText}>
            Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then reload the app.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootGate />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
    padding: spacing.md,
  },
  configCard: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: spacing.xl,
    padding: spacing.lg,
  },
  configTitle: {
    color: colors.warning,
    fontSize: fontSize.lg,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  configText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    lineHeight: 22,
  },
});
