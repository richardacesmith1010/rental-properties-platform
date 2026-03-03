import { useFocusEffect } from "expo-router";
import { Bell, Building2, CreditCard, FileText, Wrench } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { KpiCard } from "../../components/kpi-card";
import { EmptyState } from "../../components/ui/empty-state";
import { LoadingSpinner } from "../../components/ui/loading-spinner";
import { useAuth } from "../../lib/auth-context";
import {
  fetchOwnerPendingChargeCount,
  fetchOwnerPortfolio,
  fetchOwnerTickets,
} from "../../lib/owner-data";
import { fetchMobileTenantData } from "../../lib/tenant-data";
import { colors, fontSize, spacing } from "../../lib/theme";
import type { MobileTenantData } from "../../lib/types";

const EMPTY_TENANT_DATA: MobileTenantData = {
  charges: [],
  payments: [],
  tickets: [],
  units: [],
  documents: [],
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function HomeTab() {
  const { profileRole, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tenantData, setTenantData] = useState<MobileTenantData>(EMPTY_TENANT_DATA);
  const [adminPropertyCount, setAdminPropertyCount] = useState(0);
  const [adminUnitCount, setAdminUnitCount] = useState(0);
  const [adminOpenTickets, setAdminOpenTickets] = useState(0);
  const [adminPendingCharges, setAdminPendingCharges] = useState(0);

  const load = useCallback(async () => {
    if (!user?.id || !profileRole) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (profileRole === "tenant") {
        const data = await fetchMobileTenantData(user.id);
        setTenantData(data);
      } else {
        const [portfolio, tickets, pendingChargeCount] = await Promise.all([
          fetchOwnerPortfolio(user.id),
          fetchOwnerTickets(user.id),
          fetchOwnerPendingChargeCount(user.id),
        ]);

        setAdminPropertyCount(portfolio.length);
        setAdminUnitCount(portfolio.reduce((sum, property) => sum + property.unitCount, 0));
        setAdminOpenTickets(
          tickets.filter((ticket) => ticket.status === "open" || ticket.status === "in_progress").length
        );
        setAdminPendingCharges(pendingChargeCount);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load home dashboard.");
    } finally {
      setLoading(false);
    }
  }, [profileRole, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const tenantOutstanding = useMemo(
    () => tenantData.charges.reduce((sum, charge) => sum + charge.amountCents, 0),
    [tenantData.charges]
  );

  const tenantOpenTickets = useMemo(
    () => tenantData.tickets.filter((ticket) => ticket.status === "open" || ticket.status === "in_progress").length,
    [tenantData.tickets]
  );

  const tenantPendingSignatures = useMemo(
    () => tenantData.documents.filter((document) => document.signerStatus !== "signed").length,
    [tenantData.documents]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Overview</Text>
        <Text style={styles.subtitle}>Quick snapshot of the items that need attention.</Text>

        {loading ? <LoadingSpinner label="Loading dashboard..." /> : null}

        {!loading && error ? (
          <EmptyState
            description={error}
            icon={Bell}
            title="Unable to load dashboard"
          />
        ) : null}

        {!loading && !error && profileRole === "tenant" ? (
          <View style={styles.kpiGrid}>
            <KpiCard icon={CreditCard} label="Outstanding balance" value={formatCurrency(tenantOutstanding)} />
            <KpiCard icon={Wrench} label="Open tickets" value={tenantOpenTickets} />
            <KpiCard icon={FileText} label="Pending signatures" value={tenantPendingSignatures} />
          </View>
        ) : null}

        {!loading && !error && profileRole !== "tenant" ? (
          <View style={styles.kpiGrid}>
            <KpiCard icon={Building2} label="Active properties" value={adminPropertyCount} />
            <KpiCard icon={Building2} label="Total units" value={adminUnitCount} />
            <KpiCard icon={Wrench} label="Open tickets" value={adminOpenTickets} />
            <KpiCard icon={CreditCard} label="Pending charges" value={adminPendingCharges} />
          </View>
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
    lineHeight: 20,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});
