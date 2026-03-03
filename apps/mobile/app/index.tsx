import { Redirect } from "expo-router";
import { SafeAreaView, StyleSheet } from "react-native";
import { LoadingSpinner } from "../components/ui/loading-spinner";
import { useAuth } from "../lib/auth-context";
import { colors } from "../lib/theme";

export default function RootIndexRedirect() {
  const { isLoading, session } = useAuth();

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LoadingSpinner label="Loading workspace..." />
      </SafeAreaView>
    );
  }

  return <Redirect href={session ? "/(tabs)" : "/login"} />;
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
});
