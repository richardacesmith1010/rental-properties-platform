import { useFocusEffect } from "expo-router";
import { Wrench } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
} from "react-native";
import { TicketRow } from "../../components/ticket-row";
import { EmptyState } from "../../components/ui/empty-state";
import { LoadingSpinner } from "../../components/ui/loading-spinner";
import { useAuth } from "../../lib/auth-context";
import { fetchOwnerTickets } from "../../lib/owner-data";
import { colors, fontSize, spacing } from "../../lib/theme";
import type { MobileOwnerTicketDTO } from "../../lib/types";

export default function OperationsTab() {
  const { profileRole, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<MobileOwnerTicketDTO[]>([]);

  const isAdmin = profileRole === "owner" || profileRole === "manager";

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!user?.id || !isAdmin) {
      setLoading(false);
      setRefreshing(false);
      setTickets([]);
      return;
    }

    if (mode === "refresh") {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const rows = await fetchOwnerTickets(user.id);
      setTickets(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load operations.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    void load("refresh");
  }, [load]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={onRefresh}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={styles.title}>Operations</Text>
        <Text style={styles.subtitle}>Maintenance activity across the properties you administer.</Text>

        {!isAdmin ? (
          <EmptyState
            description="Operations is available to owners and managers only."
            icon={Wrench}
            title="Admin-only tab"
          />
        ) : null}

        {isAdmin && loading ? <LoadingSpinner label="Loading operations..." /> : null}

        {isAdmin && !loading && error ? (
          <EmptyState description={error} icon={Wrench} title="Could not load operations" />
        ) : null}

        {isAdmin && !loading && !error && tickets.length === 0 ? (
          <EmptyState
            description="No maintenance tickets yet for the administered properties."
            icon={Wrench}
            title="No ticket activity"
          />
        ) : null}

        {isAdmin && !loading && !error && tickets.length > 0
          ? tickets.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)
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
