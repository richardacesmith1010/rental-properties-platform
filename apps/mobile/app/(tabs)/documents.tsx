import { useFocusEffect } from "expo-router";
import { FileText } from "lucide-react-native";
import { useCallback, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text } from "react-native";
import { DocumentRow } from "../../components/document-row";
import { EmptyState } from "../../components/ui/empty-state";
import { LoadingSpinner } from "../../components/ui/loading-spinner";
import { useAuth } from "../../lib/auth-context";
import { fetchOwnerDocuments } from "../../lib/owner-data";
import { fetchTenantDocuments } from "../../lib/tenant-data";
import { colors, fontSize, spacing } from "../../lib/theme";
import type { MobileDocumentDTO } from "../../lib/types";

export default function DocumentsTab() {
  const { profileRole, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<MobileDocumentDTO[]>([]);

  const load = useCallback(async () => {
    if (!user?.id || !profileRole) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const rows =
        profileRole === "tenant"
          ? await fetchTenantDocuments(user.id)
          : await fetchOwnerDocuments(user.id);
      setDocuments(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load documents.");
    } finally {
      setLoading(false);
    }
  }, [profileRole, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Documents</Text>
        <Text style={styles.subtitle}>View packet status and document availability by role.</Text>

        {loading ? <LoadingSpinner label="Loading documents..." /> : null}

        {!loading && error ? (
          <EmptyState description={error} icon={FileText} title="Could not load documents" />
        ) : null}

        {!loading && !error && documents.length === 0 ? (
          <EmptyState
            description="Document packets will appear here once created and sent."
            icon={FileText}
            title="No documents yet"
          />
        ) : null}

        {!loading && !error && documents.length > 0
          ? documents.map((document) => <DocumentRow document={document} key={document.id} />)
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
