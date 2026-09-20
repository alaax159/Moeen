import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { confirmPrescription } from "@/features/prescription-scan/api";
import {
  buildConfirmSubmission,
  canConfirmDraft,
  describeBlockedItems,
  indexesWithStatus,
  mapResultsToDraftIndexes,
  mergeItemResults,
  pendingDraftIndexes,
  shiftResultsAfterRemoval,
  summarizeConfirmResult,
} from "@/features/prescription-scan/confirm-flow";
import {
  findPrescriptionDraftIssues,
  resolveMedicationName,
} from "@/features/prescription-scan/confirm-payload";
import { usePrescriptionDraft } from "@/features/prescription-scan/context";
import type {
  PrescriptionConfirmItemResult,
  PrescriptionMedicationDraft,
} from "@/features/prescription-scan/types";
import { useTheme } from "@/hooks/use-theme";

export default function PrescriptionReviewScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { draft, removeItem, setDraft } = usePrescriptionDraft();

  const [isConfirming, setIsConfirming] = useState(false);
  const [itemResults, setItemResults] = useState<
    PrescriptionConfirmItemResult[]
  >([]);

  // Guards against a second Confirm tap landing while the first request is
  // still in flight, which would add the medications twice.
  const confirmInFlight = useRef(false);

  const items = draft?.items ?? [];
  // Rows already added by an earlier partial response are resolved and must
  // never be part of another request.
  const pendingIndexes = pendingDraftIndexes(items, itemResults);
  const confirmEnabled =
    canConfirmDraft(items) && pendingIndexes.length > 0 && !isConfirming;

  const deleteMedication = (
    item: PrescriptionMedicationDraft,
    index: number,
  ) => {
    Alert.alert(
      "Remove medication?",
      `${resolveMedicationName(item)} will not be added.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            removeItem(index);
            setItemResults((previous) =>
              shiftResultsAfterRemoval(previous, index),
            );
          },
        },
      ],
    );
  };

  const submitConfirmation = async (
    submitIndexes: number[],
    acknowledgedIndexes: number[],
  ) => {
    const submission = buildConfirmSubmission(
      items,
      submitIndexes,
      acknowledgedIndexes,
    );

    if (!submission) {
      Alert.alert(
        "Missing details",
        "Some medications still need to be reviewed before they can be added.",
      );
      return;
    }

    try {
      setIsConfirming(true);

      const result = await confirmPrescription(submission.medications);

      // Results are indexed against the request that was just sent, so map
      // them back onto draft rows before merging them with earlier results.
      const mapped = mapResultsToDraftIndexes(
        result,
        submission.submittedIndexes,
      );
      const merged = mergeItemResults(itemResults, mapped);

      setItemResults(merged);

      const blocked = indexesWithStatus(mapped, "blocked");

      if (blocked.length > 0) {
        Alert.alert(
          "Review before adding",
          `${describeBlockedItems(result)}\n\nAdd them anyway?`,
          [
            { text: "Not now", style: "cancel" },
            {
              text: "Add anyway",
              style: "destructive",
              onPress: () => {
                // Only the blocked rows being acknowledged are resent.
                void submitConfirmation(blocked, blocked);
              },
            },
          ],
        );
        return;
      }

      const summary = summarizeConfirmResult(result);
      // Navigation waits until nothing is left pending across all attempts,
      // not just until this one response was fully successful.
      const allResolved = pendingDraftIndexes(items, merged).length === 0;

      Alert.alert(summary.title, summary.message, [
        {
          text: "OK",
          onPress: () => {
            if (allResolved) {
              setDraft(null);
              router.replace("/medications");
            }
          },
        },
      ]);
    } catch {
      Alert.alert(
        "Unable to add medications",
        "Could not connect to the server. Please try again.",
      );
    } finally {
      setIsConfirming(false);
      confirmInFlight.current = false;
    }
  };

  const confirmMedications = () => {
    if (confirmInFlight.current || !confirmEnabled) return;

    confirmInFlight.current = true;
    void submitConfirmation(pendingIndexes, []);
  };

  const reviewMedication = (
    item: PrescriptionMedicationDraft,
    index: number,
  ) => {
    const medicationName = item.normalizedName?.trim() || item.name.trim();

    router.push({
      pathname: "/medications/add",
      params: {
        genericName: medicationName,
        prescriptionRxCui: item.rxcui ?? "",

        prescriptionDose: item.dose !== null ? String(item.dose) : "",

        prescriptionUnit: item.unit ?? "",

        prescriptionDosageForm: item.dosageForm ?? "",

        prescriptionFrequency: item.frequency ?? "",

        prescriptionDuration: item.duration ?? "",

        prescriptionTimes: item.times.join("|"),

        prescriptionInstructions: item.instructions ?? "",

        prescriptionItemIndex: String(index),

        // Edit the scanned draft only; Confirm on this screen is what adds
        // the medications.
        prescriptionEditMode: "1",
      },
    });
  };

  if (!draft) {
    return (
      <ThemedView
        style={[styles.screen, { backgroundColor: theme.backgroundElement }]}
      >
        <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Go back"
              activeOpacity={0.8}
              onPress={() => router.replace("/medications")}
              style={[styles.backButton, { backgroundColor: theme.background }]}
            >
              <Ionicons name="arrow-back" size={21} color={theme.text} />
            </TouchableOpacity>

            <Text style={[styles.headerTitle, { color: theme.text }]}>
              Review Prescription
            </Text>

            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.emptyContainer}>
            <View
              style={[
                styles.emptyIcon,
                { backgroundColor: theme.primaryLight },
              ]}
            >
              <Ionicons
                name="document-text-outline"
                size={34}
                color={theme.primary}
              />
            </View>

            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              No prescription draft
            </Text>

            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Scan a prescription first before reviewing the extracted
              medication details.
            </Text>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.replace("/medications/prescription-scan")}
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            >
              <Ionicons name="scan-outline" size={19} color={theme.onPrimary} />

              <Text
                style={[styles.primaryButtonText, { color: theme.onPrimary }]}
              >
                Scan Prescription
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView
      style={[styles.screen, { backgroundColor: theme.backgroundElement }]}
    >
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Go back"
            activeOpacity={0.8}
            onPress={() => router.replace("/medications")}
            style={[styles.backButton, { backgroundColor: theme.background }]}
          >
            <Ionicons name="arrow-back" size={21} color={theme.text} />
          </TouchableOpacity>

          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Review Prescription
          </Text>

          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: theme.primaryLight,
              },
            ]}
          >
            <Ionicons
              name="information-circle-outline"
              size={23}
              color={theme.primary}
            />

            <Text style={[styles.infoText, { color: theme.primaryDark }]}>
              Check the extracted information carefully before adding each
              medication.
            </Text>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Detected Medications
            </Text>

            <View
              style={[
                styles.countBadge,
                { backgroundColor: theme.primaryLight },
              ]}
            >
              <Text style={[styles.countText, { color: theme.primary }]}>
                {draft.items.length}
              </Text>
            </View>
          </View>

          {draft.items.length === 0 ? (
            <View
              style={[
                styles.noItemsCard,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.backgroundSelected,
                },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={30}
                color={theme.textSecondary}
              />

              <Text style={[styles.noItemsTitle, { color: theme.text }]}>
                No medications detected
              </Text>

              <Text
                style={[styles.noItemsText, { color: theme.textSecondary }]}
              >
                Try scanning the prescription again with a clearer image.
              </Text>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.back()}
                style={[
                  styles.secondaryButton,
                  {
                    borderColor: theme.primary,
                  },
                ]}
              >
                <Text
                  style={[styles.secondaryButtonText, { color: theme.primary }]}
                >
                  Scan Again
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            draft.items.map((item, index) => (
              <View
                key={`${item.name}-${index}`}
                style={[
                  styles.medicationCard,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.backgroundSelected,
                  },
                ]}
              >
                <View style={styles.medicationHeader}>
                  <View
                    style={[
                      styles.medicationIcon,
                      { backgroundColor: theme.primaryLight },
                    ]}
                  >
                    <Ionicons
                      name="medical-outline"
                      size={22}
                      color={theme.primary}
                    />
                  </View>

                  <View style={styles.medicationTitleContainer}>
                    <Text
                      style={[styles.medicationName, { color: theme.text }]}
                    >
                      {item.normalizedName || item.name}
                    </Text>

                    {item.normalizedName &&
                      item.normalizedName !== item.name && (
                        <Text
                          style={[
                            styles.originalName,
                            { color: theme.textSecondary },
                          ]}
                        >
                          Detected as: {item.name}
                        </Text>
                      )}
                  </View>

                  {item.needsReview && (
                    <View
                      style={[
                        styles.reviewBadge,
                        {
                          backgroundColor: theme.backgroundSelected,
                        },
                      ]}
                    >
                      <Ionicons
                        name="alert-circle-outline"
                        size={14}
                        color={theme.danger}
                      />

                      <Text
                        style={[
                          styles.reviewBadgeText,
                          { color: theme.danger },
                        ]}
                      >
                        Review
                      </Text>
                    </View>
                  )}
                </View>

                <View
                  style={[
                    styles.divider,
                    {
                      backgroundColor: theme.backgroundSelected,
                    },
                  ]}
                />

                <DetailRow
                  label="Dose"
                  value={
                    item.dose !== null
                      ? `${item.dose}${item.unit ? ` ${item.unit}` : ""}`
                      : null
                  }
                />

                <DetailRow label="Form" value={item.dosageForm} />

                <DetailRow label="Frequency" value={item.frequency} />

                <DetailRow label="Duration" value={item.duration} />

                <DetailRow
                  label="Times"
                  value={item.times.length > 0 ? item.times.join(", ") : null}
                />

                <DetailRow
                  label="Instructions"
                  value={item.instructions}
                  multiline
                />

                <ItemStatus
                  issues={findPrescriptionDraftIssues(item)}
                  result={itemResults.find((entry) => entry.index === index)}
                />

                <View style={styles.itemActions}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Review and edit ${item.name}`}
                    activeOpacity={0.9}
                    disabled={isConfirming}
                    onPress={() => reviewMedication(item, index)}
                    style={[
                      styles.reviewButton,
                      styles.itemActionButton,
                      {
                        backgroundColor: theme.primary,
                        opacity: isConfirming ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.reviewButtonText,
                        { color: theme.onPrimary },
                      ]}
                    >
                      Review & Edit
                    </Text>

                    <Ionicons
                      name="create-outline"
                      size={18}
                      color={theme.onPrimary}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.name}`}
                    activeOpacity={0.9}
                    disabled={isConfirming}
                    onPress={() => deleteMedication(item, index)}
                    style={[
                      styles.deleteButton,
                      {
                        borderColor: theme.danger,
                        opacity: isConfirming ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={theme.danger}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          <Text style={[styles.disclaimer, { color: theme.textSecondary }]}>
            Scanned information may contain errors. Confirm all medication
            details with your prescription before saving.
          </Text>

          {items.length > 0 && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Confirm and add medications"
              accessibilityState={{ disabled: !confirmEnabled }}
              activeOpacity={0.9}
              disabled={!confirmEnabled}
              onPress={confirmMedications}
              style={[
                styles.confirmButton,
                {
                  backgroundColor: theme.primary,
                  opacity: confirmEnabled ? 1 : 0.6,
                },
              ]}
            >
              {isConfirming ? (
                <ActivityIndicator size="small" color={theme.onPrimary} />
              ) : (
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color={theme.onPrimary}
                />
              )}

              <Text
                style={[styles.confirmButtonText, { color: theme.onPrimary }]}
              >
                {isConfirming
                  ? "Adding medications..."
                  : `Confirm & Add ${items.length === 1 ? "Medication" : `${items.length} Medications`}`}
              </Text>
            </TouchableOpacity>
          )}

          {items.length > 0 && !canConfirmDraft(items) && (
            <Text style={[styles.disclaimer, { color: theme.danger }]}>
              Some medications are missing required details. Review and edit
              them, or remove them, before confirming.
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const ISSUE_LABELS: Record<string, string> = {
  name: "name",
  dose: "dose",
  unit: "unit",
  dosageForm: "form",
  times: "times",
};

// Shows what a medication still needs before it can be confirmed, or what the
// server reported for it after a confirmation attempt.
function ItemStatus({
  issues,
  result,
}: {
  issues: string[];
  result?: PrescriptionConfirmItemResult;
}) {
  const theme = useTheme();

  if (result?.status === "added") {
    return (
      <View style={styles.statusRow}>
        <Ionicons name="checkmark-circle" size={16} color={theme.success} />
        <Text style={[styles.statusText, { color: theme.success }]}>
          Added to your medications
        </Text>
      </View>
    );
  }

  if (result) {
    return (
      <View style={styles.statusRow}>
        <Ionicons name="alert-circle" size={16} color={theme.danger} />
        <Text style={[styles.statusText, { color: theme.danger }]}>
          {result.message ?? "This medication was not added."}
        </Text>
      </View>
    );
  }

  if (issues.length === 0) return null;

  return (
    <View style={styles.statusRow}>
      <Ionicons name="alert-circle-outline" size={16} color={theme.danger} />
      <Text style={[styles.statusText, { color: theme.danger }]}>
        Add the {issues.map((issue) => ISSUE_LABELS[issue] ?? issue).join(", ")}{" "}
        before confirming.
      </Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.detailRow, multiline && styles.multilineRow]}>
      <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>

      <Text
        style={[
          styles.detailValue,
          {
            color: value ? theme.text : theme.textSecondary,
          },
          multiline && styles.multilineValue,
        ]}
      >
        {value || "Not detected"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  safeArea: {
    flex: 1,
  },

  header: {
    minHeight: 70,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
  },

  headerSpacer: {
    width: 40,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 24,
  },

  infoCard: {
    borderRadius: 20,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.four,
  },

  infoText: {
    flex: 1,
    marginLeft: Spacing.three,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.three,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
  },

  countBadge: {
    marginLeft: Spacing.two,
    minWidth: 27,
    height: 27,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  countText: {
    fontSize: 13,
    fontWeight: "700",
  },

  medicationCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    shadowColor: "#173E2A",
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },

  medicationHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  medicationIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  medicationTitleContainer: {
    flex: 1,
    marginLeft: Spacing.three,
  },

  medicationName: {
    fontSize: 16,
    fontWeight: "800",
  },

  originalName: {
    fontSize: 12,
    marginTop: 3,
  },

  reviewBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.two,
    height: 28,
    borderRadius: 14,
  },

  reviewBadgeText: {
    marginLeft: 4,
    fontSize: 11,
    fontWeight: "700",
  },

  divider: {
    height: 1,
    marginVertical: Spacing.three,
  },

  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.two,
  },

  multilineRow: {
    flexDirection: "column",
  },

  detailLabel: {
    fontSize: 13,
    fontWeight: "600",
  },

  detailValue: {
    flex: 1,
    marginLeft: Spacing.three,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "500",
  },

  multilineValue: {
    marginLeft: 0,
    marginTop: Spacing.one,
    textAlign: "left",
    lineHeight: 19,
  },

  reviewButton: {
    minHeight: 48,
    borderRadius: 16,
    marginTop: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },

  reviewButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },

  itemActions: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  itemActionButton: {
    flex: 1,
  },
  deleteButton: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
  },
  statusRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: Spacing.one,
    paddingBottom: Spacing.two,
  },
  statusText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  confirmButton: {
    alignItems: "center",
    borderRadius: 16,
    flexDirection: "row",
    gap: Spacing.two,
    justifyContent: "center",
    marginTop: Spacing.three,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  disclaimer: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: Spacing.two,
  },

  noItemsCard: {
    borderWidth: 1,
    borderRadius: 22,
    alignItems: "center",
    padding: Spacing.four,
  },

  noItemsTitle: {
    marginTop: Spacing.two,
    fontSize: 16,
    fontWeight: "700",
  },

  noItemsText: {
    marginTop: Spacing.one,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },

  secondaryButton: {
    minHeight: 46,
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: Spacing.four,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.three,
  },

  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },

  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.four,
  },

  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.three,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
  },

  emptyText: {
    marginTop: Spacing.two,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },

  primaryButton: {
    minHeight: 50,
    borderRadius: 16,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.four,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },

  primaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
