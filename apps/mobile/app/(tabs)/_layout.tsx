import { Tabs } from "expo-router";
import {
  Bell,
  CreditCard,
  FileText,
  FolderOpen,
  Home,
  Wrench,
} from "lucide-react-native";
import { SafeAreaView, StyleSheet } from "react-native";
import { LoadingSpinner } from "../../components/ui/loading-spinner";
import { useAuth } from "../../lib/auth-context";
import { colors } from "../../lib/theme";

function roleAllowsTenantTabs(role: string | null) {
  return role === "tenant";
}

function roleAllowsAdminTabs(role: string | null) {
  return role === "owner" || role === "manager";
}

export default function TabsLayout() {
  const { profileRole } = useAuth();

  if (!profileRole) {
    return (
      <SafeAreaView style={styles.loadingRoot}>
        <LoadingSpinner label="Loading workspace tabs..." />
      </SafeAreaView>
    );
  }

  const canUseTenantTabs = roleAllowsTenantTabs(profileRole);
  const canUseAdminTabs = roleAllowsAdminTabs(profileRole);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.surfaceBorder,
        },
        sceneStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="charges"
        options={{
          title: "Charges",
          href: canUseTenantTabs ? undefined : null,
          tabBarIcon: ({ color, size }) => <CreditCard color={color} size={size} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="maintenance"
        options={{
          title: "Maintenance",
          href: canUseTenantTabs ? undefined : null,
          tabBarIcon: ({ color, size }) => <Wrench color={color} size={size} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: "Documents",
          tabBarIcon: ({ color, size }) => <FileText color={color} size={size} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: "Portfolio",
          href: canUseAdminTabs ? undefined : null,
          tabBarIcon: ({ color, size }) => <FolderOpen color={color} size={size} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="operations"
        options={{
          title: "Operations",
          href: canUseAdminTabs ? undefined : null,
          tabBarIcon: ({ color, size }) => <Wrench color={color} size={size} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color, size }) => <Bell color={color} size={size} strokeWidth={2} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loadingRoot: {
    backgroundColor: colors.background,
    flex: 1,
  },
});
