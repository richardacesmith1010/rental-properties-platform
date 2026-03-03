import { StyleSheet, Text, View } from "react-native";
import type { MobilePropertySummaryDTO } from "../lib/types";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { colors, fontSize, spacing } from "../lib/theme";

export function PropertyCard({ property }: { property: MobilePropertySummaryDTO }) {
  const occupancy = property.unitCount > 0
    ? `${property.occupiedUnitCount}/${property.unitCount} occupied`
    : "No units";

  return (
    <Card>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{property.name}</Text>
        <Badge label={occupancy} variant="info" />
      </View>
      <Text style={styles.address}>
        {property.addressLine1}, {property.city}, {property.state} {property.postalCode}
      </Text>
      <View style={styles.footerRow}>
        <Text style={styles.meta}>Units: {property.unitCount}</Text>
        <Text style={styles.meta}>Occupied: {property.occupiedUnitCount}</Text>
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
  address: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  footerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
});
