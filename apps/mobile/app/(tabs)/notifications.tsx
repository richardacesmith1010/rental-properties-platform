import { useFocusEffect } from "expo-router";
import { Bell } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { LoadingSpinner } from "../../components/ui/loading-spinner";
import { useAuth } from "../../lib/auth-context";
import { markNotificationRead } from "../../lib/notification-actions";
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<MobileNotificationDTO[]>([]);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!user?.id) {
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
      const rows = await fetchNotifications(user.id);
      setNotifications(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load notifications.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    void load("refresh");
  }, [load]);

  const handleMarkRead = async (notificationId: string) => {
    setMarkingId(notificationId);
    const result = await markNotificationRead(notificationId);

    if (!result.success) {
      setError(result.error ?? "Unable to mark notification as read.");
      setMarkingId(null);
      return;
    }

    await load("refresh");
    setMarkingId(null);
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
                    <Text style={[styles.notificationTitle, !isUnread ? styles.notificationTitleRead : null]}>
                      {notification.title}
                    </Text>
                    <Badge label={isUnread ? "Unread" : "Read"} variant={isUnread ? "warning" : "default"} />
                  </View>
                  <Text style={[styles.body, !isUnread ? styles.bodyRead : null]}>{notification.body}</Text>
                  <View style={styles.footerRow}>
                    <Text style={styles.meta}>{formatDate(notification.createdAt)}</Text>
                    {isUnread ? (
                      <Button
                        disabled={markingId === notification.id}
                        onPress={() => void handleMarkRead(notification.id)}
                        variant="secondary"
                      >
                        {markingId === notification.id ? "Marking..." : "Mark Read"}
                      </Button>
                    ) : null}
                  </View>
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
    fontWeight: "800",
  },
  notificationTitleRead: {
    color: colors.textSecondary,
    fontWeight: "600",
  },
  body: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  bodyRead: {
    color: colors.textSecondary,
  },
  footerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
  },
});
