import { Platform, StyleSheet } from "react-native";

import { Radius, Spacing, Typography } from "@/constants/theme";

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  scrollView: {
    flex: 1,
  },

  header: {
    minHeight: 82,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
  },

  headerText: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.two,
  },

  circleButton: {
    width: 42,
    height: 42,
    borderRadius: Radius.control,
    alignItems: "center",
    justifyContent: "center",

    ...Platform.select({
      android: {
        elevation: 2,
      },
    }),
  },

  title: {
    ...Typography.pageTitle,
  },

  subtitle: {
    ...Typography.caption,
    marginTop: 2,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 154,
  },

  card: {
    marginBottom: 14,
    padding: 16,
    borderWidth: 1,
    borderRadius: Radius.large,
    shadowColor: "#173E2A",
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },

    ...Platform.select({
      android: {
        elevation: 1,
      },
    }),
  },

  cardLabel: {
    ...Typography.sectionTitle,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: Spacing.two,
  },

  sectionHeader: {
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  sectionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  sectionTitle: {
    ...Typography.label,
    fontWeight: "700",
  },

  fieldLabel: {
    ...Typography.label,
    marginBottom: 7,
  },

  fieldSpacing: {
    marginTop: Spacing.three,
  },

  field: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: Radius.control,
    ...Typography.body,
    fontSize: 15,
  },

  twoColumns: {
    flexDirection: "row",
    gap: Spacing.two,
  },

  column: {
    flex: 1,
  },

  verifiedRow: {
    marginTop: Spacing.two,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  verifiedText: {
    fontSize: 12,
    fontWeight: "700",
  },

  timeGrid: {
    marginTop: Spacing.three,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },

  timeChip: {
    minWidth: 116,
    minHeight: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: Radius.control,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },

  timeInput: {
    minWidth: 58,
    padding: 0,
    ...Typography.bodyStrong,
  },

  dateField: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },

  dateInput: {
    flex: 1,
    padding: 0,
    ...Typography.body,
  },

  endDateBanner: {
    minHeight: 44,
    marginTop: 16,
    paddingHorizontal: 13,
    borderRadius: Radius.control,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },

  endDateText: {
    ...Typography.label,
  },

  instructionsInput: {
    minHeight: 116,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    borderWidth: 1,
    borderRadius: Radius.control,
    ...Typography.body,
  },

  warningBox: {
    marginBottom: 18,
    padding: 14,
    borderWidth: 1,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
  },

  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },

  footer: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: "#173E2A",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 5,
  },

  saveButton: {
    minHeight: 56,
    borderRadius: Radius.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },

  saveButtonText: {
    ...Typography.button,
    fontSize: 15,
  },
});
