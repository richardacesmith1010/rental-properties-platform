import { useFocusEffect } from "expo-router";
import { FolderOpen } from "lucide-react-native";
import { useCallback, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text } from "react-native";
import { PropertyCard } from "../../components/property-card";
import { EmptyState } from "../../components/ui/empty-state";
import { LoadingSpinner } from "../../components/ui/loading-spinner";
import { useAuth } from "../../lib/auth-context";
import { fetchOwnerPortfolio } from "../../lib/owner-data";
import { colors, fontSize, spacing } from "../../lib/theme";
import type { MobilePropertySummaryDTO } from "../../lib/types";

export default function PortfolioTab() {
  const { profileRole, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [properties, setProperties] = useState<MobilePropertySummaryDTO[]>([]);

  const isAdmin = profileRole === "owner" || profileRole === "manager";

  const load = useCallback(async () => {
    if (!user?.id || !isAdmin) {
      setLoading(false);
      setProperties([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const rows = await fetchOwnerPortfolio(user.id);
      setProperties(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load portfolio.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Portfolio</Text>
        <Text style={styles.subtitle}>Property and unit summaries for owned or managed assets.</Text>

        {!isAdmin ? (
          <EmptyState
            description="Portfolio is only available for owner and manager roles."
            icon={FolderOpen}
            title="Admin-only tab"
          />
        ) : null}

        {isAdmin && loading ? <LoadingSpinner label="Loading portfolio..." /> : null}

        {isAdmin && !loading && error ? (
          <EmptyState description={error} icon={FolderOpen} title="Could not load portfolio" />
        ) : null}

        {isAdmin && !loading && !error && properties.length === 0 ? (
          <EmptyState
            description="No properties are assigned to your account yet."
            icon={FolderOpen}
            title="No properties"
          />
        ) : null}

        {isAdmin && !loading && !error && properties.length > 0
          ? properties.map((property) => <PropertyCard key={property.id} property={property} />)
          : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  container: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
});
