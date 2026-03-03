import { useFocusEffect } from "expo-router";
import { CreditCard } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Linking, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { ChargeRow } from "../../components/charge-row";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { LoadingSpinner } from "../../components/ui/loading-spinner";
import { useAuth } from "../../lib/auth-context";
import { fetchTenantCharges, fetchTenantPayments } from "../../lib/tenant-data";
import { colors, fontSize, spacing } from "../../lib/theme";
import type { MobileChargeDTO, MobilePaymentDTO } from "../../lib/types";

const WEB_APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? "https://rental-properties-platform-web.vercel.app";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ChargesTab() {
  const { profileRole, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [charges, setCharges] = useState<MobileChargeDTO[]>([]);
  const [payments, setPayments] = useState<MobilePaymentDTO[]>([]);

  const load = useCallback(async () => {
    if (!user?.id || profileRole !== "tenant") {
      setLoading(false);
      setCharges([]);
      setPayments([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [chargeRows, paymentRows] = await Promise.all([
        fetchTenantCharges(user.id),
        fetchTenantPayments(user.id),
      ]);
      setCharges(chargeRows);
      setPayments(paymentRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load charges.");
    } finally {
      setLoading(false);
    }
  }, [profileRole, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const outstanding = useMemo(
    () => charges.reduce((sum, charge) => sum + charge.amountCents, 0),
    [charges]
  );

  if (profileRole !== "tenant") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <EmptyState
            description="Charges are tenant-only in mobile Phase 1. Use Home, Portfolio, or Operations for admin workflows."
            icon={CreditCard}
            title="Tenant charges only"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Charges</Text>
        <Text style={styles.subtitle}>Outstanding rent charges and payment history.</Text>

        {loading ? <LoadingSpinner label="Loading charges..." /> : null}

        {!loading && error ? (
          <EmptyState description={error} icon={CreditCard} title="Could not load charges" />
        ) : null}

        {!loading && !error ? (
          <Card>
            <Text style={styles.kpiLabel}>Outstanding Balance</Text>
            <Text style={styles.kpiValue}>{formatCurrency(outstanding)}</Text>
          </Card>
        ) : null}

        {!loading && !error && charges.length > 0
          ? charges.map((charge) => <ChargeRow key={charge.id} charge={charge} />)
          : null}

        {!loading && !error && charges.length === 0 ? (
          <EmptyState
            description="No pending or late charges right now."
            icon={CreditCard}
            title="No outstanding charges"
          />
        ) : null}

        {!loading && !error ? (
          <Button onPress={() => void Linking.openURL(`${WEB_APP_URL}/tenant`)}>
            Pay via Web Checkout
          </Button>
        ) : null}

        {!loading && !error ? (
          <View style={styles.historyWrap}>
            <Text style={styles.sectionTitle}>Recent Payments</Text>
            {payments.length === 0 ? (
              <EmptyState
                description="Completed payments will appear here once rent is paid."
                icon={CreditCard}
                title="No payments yet"
              />
            ) : (
              payments.map((payment) => (
                <Card key={payment.id}>
                  <View style={styles.paymentRow}>
                    <Text style={styles.paymentAmount}>{formatCurrency(payment.amountCents)}</Text>
                    <Text style={styles.paymentMeta}>{formatDate(payment.paidAt)}</Text>
                  </View>
                  <Text style={styles.paymentMeta}>Method: {payment.method}</Text>
                </Card>
              ))
            )}
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
  },
  kpiLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  kpiValue: {
    color: colors.primary,
    fontSize: fontSize.xl,
    fontWeight: "800",
  },
  historyWrap: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: "700",
  },
  paymentRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  paymentAmount: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "700",
  },
  paymentMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
});
