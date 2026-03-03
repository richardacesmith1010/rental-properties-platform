import { StyleSheet, Text, View } from "react-native";
import type { MobileOwnerTicketDTO, MobileTicketDTO } from "../lib/types";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { colors, fontSize, spacing } from "../lib/theme";

type TicketLike = MobileTicketDTO | MobileOwnerTicketDTO;

function statusVariant(status: TicketLike["status"]) {
  if (status === "open") {
    return "warning" as const;
  }
  if (status === "in_progress") {
    return "info" as const;
  }
  if (status === "resolved") {
    return "success" as const;
  }
  return "default" as const;
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

export function TicketRow({ ticket }: { ticket: TicketLike }) {
  const unitText = ticket.unitNumber ? ` • Unit ${ticket.unitNumber}` : "";

  return (
    <Card>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{ticket.title}</Text>
        <Badge label={ticket.status.replaceAll("_", " ")} variant={statusVariant(ticket.status)} />
      </View>
      <Text style={styles.meta}>
        {ticket.propertyName}
        {unitText}
      </Text>
      <Text style={styles.description}>{ticket.description}</Text>
      <View style={styles.footerRow}>
        <Badge label={ticket.priority} variant={ticket.priority === "urgent" ? "danger" : "info"} />
        <Text style={styles.meta}>{formatDate(ticket.createdAt)}</Text>
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
  description: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  footerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
});
