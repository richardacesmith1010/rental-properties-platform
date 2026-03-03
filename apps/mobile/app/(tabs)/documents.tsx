import { useFocusEffect } from "expo-router";
import { FileText } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { DocumentRow } from "../../components/document-row";
import { SignDocumentModal } from "../../components/sign-document-modal";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { LoadingSpinner } from "../../components/ui/loading-spinner";
import { useAuth } from "../../lib/auth-context";
import { signDocumentMobile } from "../../lib/document-actions";
import { fetchOwnerDocuments } from "../../lib/owner-data";
import { fetchTenantDocuments } from "../../lib/tenant-data";
import { colors, fontSize, spacing } from "../../lib/theme";
import type { MobileDocumentDTO } from "../../lib/types";

export default function DocumentsTab() {
  const { profileRole, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [documents, setDocuments] = useState<MobileDocumentDTO[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<MobileDocumentDTO | null>(null);

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
      const rows =
        profileRole === "tenant"
          ? await fetchTenantDocuments(user.id)
          : await fetchOwnerDocuments(user.id);
      setDocuments(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load documents.");
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

  const pendingDocuments = useMemo(
    () => documents.filter((document) => document.signerStatus === "pending"),
    [documents]
  );

  const handleSignDocument = async (signatureText: string) => {
    if (!selectedDocument?.signerId) {
      setError("This document cannot be signed from mobile yet.");
      return;
    }

    setSigning(true);
    setError(null);
    setSuccessMessage(null);

    const result = await signDocumentMobile({
      packetId: selectedDocument.id,
      signerId: selectedDocument.signerId,
      signatureText,
    });

    if (!result.success) {
      setError(result.error ?? "Unable to sign document.");
      setSigning(false);
      return;
    }

    setSelectedDocument(null);
    setSuccessMessage("Document signed successfully.");
    await load("refresh");
    setSigning(false);
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
        <Text style={styles.title}>Documents</Text>
        <Text style={styles.subtitle}>View packet status and document availability by role.</Text>

        {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}

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
          ? documents.map((document) => (
              <View key={document.id} style={styles.documentWrap}>
                <DocumentRow document={document} />
                {profileRole === "tenant" && document.signerStatus === "pending" ? (
                  <Button onPress={() => setSelectedDocument(document)}>
                    Sign Document
                  </Button>
                ) : null}
              </View>
            ))
          : null}

        {!loading && !error && profileRole === "tenant" && pendingDocuments.length === 0 ? (
          <Text style={styles.infoText}>No pending signatures at this time.</Text>
        ) : null}
      </ScrollView>

      <SignDocumentModal
        document={selectedDocument}
        onClose={() => setSelectedDocument(null)}
        onSign={handleSignDocument}
        submitting={signing}
        visible={Boolean(selectedDocument)}
      />
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
  infoText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  documentWrap: {
    gap: spacing.sm,
  },
});
