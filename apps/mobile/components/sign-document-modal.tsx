import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { MobileDocumentDTO } from "../lib/types";
import { borderRadius, colors, fontSize, spacing } from "../lib/theme";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface SignDocumentModalProps {
  visible: boolean;
  document: MobileDocumentDTO | null;
  submitting: boolean;
  onClose: () => void;
  onSign: (signatureText: string) => Promise<void>;
}

export function SignDocumentModal({
  visible,
  document,
  submitting,
  onClose,
  onSign,
}: SignDocumentModalProps) {
  const [signatureText, setSignatureText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setSignatureText("");
      setError(null);
    }
  }, [visible]);

  const handleSign = async () => {
    if (!signatureText.trim()) {
      setError("Enter your full legal name before signing.");
      return;
    }

    setError(null);
    await onSign(signatureText.trim());
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <Pressable onPress={onClose} style={styles.overlay}>
        <Pressable onPress={(event) => event.stopPropagation()} style={styles.sheet}>
          <Text style={styles.title}>Sign Document</Text>

          <Text style={styles.metaLabel}>Template</Text>
          <Text style={styles.metaValue}>{document?.templateName ?? "Document"}</Text>

          <Text style={styles.metaLabel}>Property</Text>
          <Text style={styles.metaValue}>{document?.propertyLabel ?? "Property"}</Text>

          <Input
            autoCapitalize="words"
            label="Legal signature"
            onChangeText={setSignatureText}
            placeholder="Full legal name"
            value={signatureText}
          />

          <Text style={styles.disclaimer}>
            By signing, you agree to the terms of this document.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.buttonRow}>
            <Button onPress={onClose} variant="secondary">Cancel</Button>
            <Button disabled={submitting} onPress={() => void handleSign()}>
              {submitting ? "Signing..." : "Sign"}
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
    width: "100%",
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: "800",
    marginBottom: spacing.xs,
  },
  metaLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  metaValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  disclaimer: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  error: {
    color: colors.danger,
    fontSize: fontSize.xs,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "flex-end",
    marginTop: spacing.xs,
  },
});
