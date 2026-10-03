import { StyleSheet } from "@react-pdf/renderer";

export const colors = {
  text: "#191B1E",
  textMuted: "#6F757C",
  border: "#E6E6E0",
  white: "#FFFFFF",
  surface2: "#F5F5F1",
  accent: "#1D4ED8",
  success: "#15803D",
  danger: "#B91C1C"
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  brandName: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: colors.text
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
    color: colors.text,
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
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surface2,
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
    borderTopColor: colors.border
  },
  totalLabel: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold"
  },
  totalValue: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: colors.text
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
