import { useFocusEffect } from "expo-router";
import { Bell } from "lucide-react-native";
import { useCallback, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { Badge } from "../../components/ui/badge";
import { Card } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { LoadingSpinner } from "../../components/ui/loading-spinner";
import { useAuth } from "../../lib/auth-context";
import { fetchNotifications } from "../../lib/notifications";
import { colors, fontSize, spacing } from "../../lib/theme";
import type { MobileNotificationDTO } from "../../lib/types";

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

export default function NotificationsTab() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<MobileNotificationDTO[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const rows = await fetchNotifications(user.id);
      setNotifications(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.subtitle}>System updates and workflow alerts for your role.</Text>

        {loading ? <LoadingSpinner label="Loading notifications..." /> : null}

        {!loading && error ? (
          <EmptyState description={error} icon={Bell} title="Could not load notifications" />
        ) : null}

        {!loading && !error && notifications.length === 0 ? (
          <EmptyState
            description="No notifications yet. Alerts appear when new activity happens."
            icon={Bell}
            title="No notifications"
          />
        ) : null}

        {!loading && !error && notifications.length > 0
          ? notifications.map((notification) => {
              const isUnread = !notification.readAt;
              return (
                <Card key={notification.id}>
                  <View style={styles.headerRow}>
                    <Text style={styles.notificationTitle}>{notification.title}</Text>
                    <Badge label={isUnread ? "Unread" : "Read"} variant={isUnread ? "warning" : "default"} />
                  </View>
                  <Text style={styles.body}>{notification.body}</Text>
                  <Text style={styles.meta}>{formatDate(notification.createdAt)}</Text>
                </Card>
              );
            })
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
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  notificationTitle: {
    color: colors.text,
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: "700",
  },
  body: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
  },
});
