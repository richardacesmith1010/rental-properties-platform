import { StyleSheet, Text, View } from "react-native";
import type { MobileDocumentDTO } from "../lib/types";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { colors, fontSize, spacing } from "../lib/theme";

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

export function DocumentRow({ document }: { document: MobileDocumentDTO }) {
  return (
    <Card>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{document.templateName}</Text>
        <Badge
          label={document.signerStatus}
          variant={document.signerStatus === "signed" ? "success" : "warning"}
        />
      </View>
      <Text style={styles.meta}>{document.propertyLabel}</Text>
      <View style={styles.footerRow}>
        <Text style={styles.meta}>Packet: {document.packetStatus}</Text>
        <Text style={styles.meta}>{formatDate(document.createdAt)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: "700",
  },
  meta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  footerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
});
