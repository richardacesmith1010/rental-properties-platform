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
import { TicketForm } from "../../components/ticket-form";
import { TicketRow } from "../../components/ticket-row";
import { EmptyState } from "../../components/ui/empty-state";
import { LoadingSpinner } from "../../components/ui/loading-spinner";
import { useAuth } from "../../lib/auth-context";
import { fetchOwnerTickets } from "../../lib/owner-data";
import { uploadTicketPhoto } from "../../lib/photo-upload";
import {
  createTenantTicket,
  fetchTenantTickets,
  fetchTenantUnits,
} from "../../lib/tenant-data";
import { colors, fontSize, spacing } from "../../lib/theme";
import type { MobileOwnerTicketDTO, MobileTenantUnitDTO, MobileTicketDTO } from "../../lib/types";

export default function MaintenanceTab() {
  const { profileRole, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [tenantUnits, setTenantUnits] = useState<MobileTenantUnitDTO[]>([]);
  const [tenantTickets, setTenantTickets] = useState<MobileTicketDTO[]>([]);
  const [adminTickets, setAdminTickets] = useState<MobileOwnerTicketDTO[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!user?.id || !profileRole) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (mode === "refresh") {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      if (profileRole === "tenant") {
        const [units, tickets] = await Promise.all([
          fetchTenantUnits(user.id),
          fetchTenantTickets(user.id),
        ]);

        setTenantUnits(units);
        setTenantTickets(tickets);
      } else {
        const tickets = await fetchOwnerTickets(user.id);
        setAdminTickets(tickets);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load maintenance data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profileRole, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    void load("refresh");
  }, [load]);

  const handleCreateTicket = async (payload: {
    unitId: string;
    title: string;
    description: string;
    priority: MobileTicketDTO["priority"];
    photoUri: string | null;
  }) => {
    if (!user?.id) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const createdTicketId = await createTenantTicket({
        userId: user.id,
        unitId: payload.unitId,
        title: payload.title,
        description: payload.description,
        priority: payload.priority,
      });

      if (payload.photoUri) {
        const uploadResult = await uploadTicketPhoto({
          ticketId: createdTicketId,
          userId: user.id,
          photoUri: payload.photoUri,
        });

        if (!uploadResult.success) {
          setError(uploadResult.error ?? "Ticket created, but photo upload failed.");
        }
      }

      if (!payload.photoUri) {
        setSuccessMessage("Maintenance ticket submitted.");
      } else {
        setSuccessMessage("Maintenance ticket submitted with photo.");
      }

      await load("refresh");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit ticket.");
    } finally {
      setSubmitting(false);
    }
  };

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
        <Text style={styles.title}>Maintenance</Text>
        <Text style={styles.subtitle}>Track open issues and submit new maintenance requests.</Text>

        {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}

        {loading ? <LoadingSpinner label="Loading maintenance..." /> : null}

        {!loading && error ? (
          <EmptyState description={error} icon={Wrench} title="Could not load maintenance" />
        ) : null}

        {!loading && !error && profileRole === "tenant" ? (
          <>
            <TicketForm onSubmit={handleCreateTicket} submitting={submitting} units={tenantUnits} />

            {tenantTickets.length === 0 ? (
              <EmptyState
                description="Your submitted maintenance tickets will show up here."
                icon={Wrench}
                title="No maintenance tickets"
              />
            ) : (
              tenantTickets.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)
            )}
          </>
        ) : null}

        {!loading && !error && profileRole !== "tenant" ? (
          adminTickets.length === 0 ? (
            <EmptyState
              description="No open or historical maintenance tickets for your properties."
              icon={Wrench}
              title="No maintenance activity"
            />
          ) : (
            adminTickets.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)
          )
        ) : null}
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
  success: {
    color: colors.success,
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
});
