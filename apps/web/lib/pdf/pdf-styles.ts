import { StyleSheet } from "@react-pdf/renderer";

export const colors = {
  primary: "#7c3aed",
  primaryLight: "#ede9fe",
  success: "#10b981",
  text: "#1f2937",
  textMuted: "#6b7280",
  border: "#e5e7eb",
  white: "#ffffff",
  danger: "#dc2626"
};

export const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: colors.text,
    backgroundColor: colors.white
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  brandMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10
  },
  brandMarkText: {
    color: colors.white,
    fontSize: 14,
    fontFamily: "Helvetica-Bold"
  },
  brandName: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: colors.primary
  },
  brandSubtitle: {
    fontSize: 8,
    color: colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.8
  },
  headerMeta: {
    alignItems: "flex-end"
  },
  headerMetaLabel: {
    fontSize: 8,
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 3
  },
  headerMetaValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold"
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6
  },
  subtitle: {
    fontSize: 10,
    color: colors.textMuted,
    marginBottom: 18
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.success,
    color: colors.white,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginBottom: 16
  },
  section: {
    marginBottom: 18
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
    marginBottom: 8,
    textTransform: "uppercase"
  },
  panel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.white
  },
  accentPanel: {
    borderWidth: 1,
    borderColor: colors.primaryLight,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.primaryLight,
    marginBottom: 18
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  rowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0
  },
  label: {
    fontSize: 10,
    color: colors.textMuted,
    width: "40%"
  },
  value: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    width: "60%",
    textAlign: "right"
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 10,
    marginTop: 10,
    borderTopWidth: 2,
    borderTopColor: colors.primary
  },
  totalLabel: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold"
  },
  totalValue: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: colors.primary
  },
  twoColumnRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  column: {
    width: "48%"
  },
  helperText: {
    fontSize: 9,
    color: colors.textMuted,
    lineHeight: 1.5
  },
  emphasisText: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold"
  },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: colors.textMuted
  },
  emptyStateTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    marginBottom: 10
  },
  emptyStateBody: {
    fontSize: 10,
    color: colors.textMuted,
    lineHeight: 1.5
  }
});
