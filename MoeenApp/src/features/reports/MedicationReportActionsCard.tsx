import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

import { getMedicationReportSourceData } from "./medication-report-data";
import {
  MedicationReportExportError,
  cleanupGeneratedMedicationReportPdf,
  downloadMedicationReportPdf,
  generateMedicationReportPdf,
  shareMedicationReportPdf,
  type GeneratedMedicationReport,
} from "./medication-report-export-core";
import { nativeMedicationReportExportAdapter } from "./medication-report-export-native";
import { renderMedicationUsageReportHtml } from "./medication-report-html";
import { buildMedicationUsageReport } from "./medication-usage-report";

type ReportOperation = "generating" | "downloading" | "sharing" | null;
type FeedbackKind = "success" | "error" | "info";

interface Feedback {
  kind: FeedbackKind;
  message: string;
}

interface GeneratedReportDetails {
  adherencePeriod: string;
  medicationCount: number;
  generatedAt: string;
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatGeneratedTime(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function feedbackForError(
  error: unknown,
  fallback: string,
): Feedback {
  if (error instanceof MedicationReportExportError) {
    if (error.code === "download_cancelled") {
      return {
        kind: "info",
        message: "Download cancelled. No file was saved.",
      };
    }

    if (error.code === "sharing_unavailable") {
      return {
        kind: "error",
        message: "Sharing is not available on this device.",
      };
    }

    return {
      kind: "error",
      message: error.message,
    };
  }

  return {
    kind: "error",
    message: fallback,
  };
}

export function MedicationReportActionsCard() {
  const theme = useTheme();

  const [operation, setOperation] = useState<ReportOperation>(null);
  const [generatedReport, setGeneratedReport] =
    useState<GeneratedMedicationReport | null>(null);
  const [reportDetails, setReportDetails] =
    useState<GeneratedReportDetails | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const operationIdRef = useRef(0);
  const operationLockRef = useRef(false);
  const generationControllerRef = useRef<AbortController | null>(null);
  const generatedReportRef = useRef<GeneratedMedicationReport | null>(null);
  const mountedRef = useRef(true);
  const isBusy = operation !== null;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      operationIdRef.current += 1;
      operationLockRef.current = false;
      generationControllerRef.current?.abort();
      generationControllerRef.current = null;

      const reportToDelete = generatedReportRef.current;
      generatedReportRef.current = null;

      if (reportToDelete) {
        void cleanupGeneratedMedicationReportPdf(
          reportToDelete,
          nativeMedicationReportExportAdapter,
        );
      }
    };
  }, []);

  async function handleGenerate() {
    if (isBusy || operationLockRef.current) {
      return;
    }

    operationLockRef.current = true;

    const operationId = operationIdRef.current + 1;
    operationIdRef.current = operationId;

    setOperation("generating");
    setFeedback(null);

    const controller = new AbortController();
    generationControllerRef.current = controller;

    try {
      const sourceData = await getMedicationReportSourceData(
        controller.signal,
      );
      const generatedAt = new Date();

      const report = buildMedicationUsageReport(
        sourceData.medications,
        sourceData.weeklyDoses,
        generatedAt.toISOString(),
      );

      const html = renderMedicationUsageReportHtml(report);

      const generated = await generateMedicationReportPdf(
        html,
        nativeMedicationReportExportAdapter,
        generatedAt,
      );

      if (
        !mountedRef.current ||
        operationIdRef.current !== operationId
      ) {
        await cleanupGeneratedMedicationReportPdf(
          generated,
          nativeMedicationReportExportAdapter,
        );
        return;
      }

      const previousReport = generatedReportRef.current;

      if (
        previousReport &&
        previousReport.uri !== generated.uri
      ) {
        await cleanupGeneratedMedicationReportPdf(
          previousReport,
          nativeMedicationReportExportAdapter,
        );
      }

      if (
        !mountedRef.current ||
        operationIdRef.current !== operationId
      ) {
        await cleanupGeneratedMedicationReportPdf(
          generated,
          nativeMedicationReportExportAdapter,
        );
        return;
      }

      generatedReportRef.current = generated;
      setGeneratedReport(generated);
      setReportDetails({
        adherencePeriod: `${formatDate(report.adherencePeriod.startDate)} – ${formatDate(
          report.adherencePeriod.endDate,
        )}`,
        medicationCount: report.medicationSummary.total,
        generatedAt: formatGeneratedTime(generatedAt),
      });

      setFeedback({
        kind: "success",
        message: "Your medication report is ready to download or share.",
      });
    } catch (error) {
      if (
        controller.signal.aborted ||
        !mountedRef.current ||
        operationIdRef.current !== operationId
      ) {
        return;
      }

      setFeedback(
        feedbackForError(
          error,
          "Unable to generate the medication report. Please try again.",
        ),
      );
    } finally {
      if (generationControllerRef.current === controller) {
        generationControllerRef.current = null;
      }

      operationLockRef.current = false;

      if (
        mountedRef.current &&
        operationIdRef.current === operationId
      ) {
        setOperation(null);
      }
    }
  }

  async function handleDownload() {
    if (
      !generatedReport ||
      isBusy ||
      operationLockRef.current
    ) {
      return;
    }

    operationLockRef.current = true;
    setOperation("downloading");
    setFeedback(null);

    try {
      await downloadMedicationReportPdf(
        generatedReport,
        nativeMedicationReportExportAdapter,
      );

      if (!mountedRef.current) {
        return;
      }

      setFeedback({
        kind: "success",
        message: "Medication report saved successfully.",
      });
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      setFeedback(
        feedbackForError(
          error,
          "Unable to save the medication report. Please try again.",
        ),
      );
    } finally {
      operationLockRef.current = false;

      if (mountedRef.current) {
        setOperation(null);
      }
    }
  }

  async function handleShare() {
    if (
      !generatedReport ||
      isBusy ||
      operationLockRef.current
    ) {
      return;
    }

    operationLockRef.current = true;
    setOperation("sharing");
    setFeedback(null);

    try {
      await shareMedicationReportPdf(
        generatedReport,
        nativeMedicationReportExportAdapter,
      );

      if (!mountedRef.current) {
        return;
      }

      setFeedback({
        kind: "success",
        message: "Report is ready in the share menu.",
      });
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      setFeedback(
        feedbackForError(
          error,
          "Unable to share the medication report. Please try again.",
        ),
      );
    } finally {
      operationLockRef.current = false;

      if (mountedRef.current) {
        setOperation(null);
      }
    }
  }

  const feedbackBackground =
    feedback?.kind === "error"
      ? theme.dangerLight
      : feedback?.kind === "success"
        ? theme.primaryLight
        : theme.backgroundSelected;

  const feedbackColor =
    feedback?.kind === "error"
      ? theme.danger
      : feedback?.kind === "success"
        ? theme.primary
        : theme.textSecondary;

  const feedbackIcon =
    feedback?.kind === "error"
      ? "alert-circle-outline"
      : feedback?.kind === "success"
        ? "checkmark-circle-outline"
        : "information-circle-outline";

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        Medication Report
      </Text>

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.background,
            borderColor: theme.backgroundSelected,
          },
        ]}
      >
        <View style={styles.header}>
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor: theme.primaryLight,
              },
            ]}
          >
            <Ionicons
              name="document-text-outline"
              size={25}
              color={theme.primary}
            />
          </View>

          <View style={styles.headerContent}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: theme.text }]}>
                Medication Usage Report
              </Text>

              <View
                style={[
                  styles.pdfBadge,
                  {
                    backgroundColor: theme.accentLavenderBg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pdfBadgeText,
                    {
                      color: theme.accentLavenderIcon,
                    },
                  ]}
                >
                  PDF
                </Text>
              </View>
            </View>

            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              A clear summary of your medication history and recent adherence.
            </Text>
          </View>
        </View>

        {reportDetails ? (
          <View
            style={[
              styles.readyPanel,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.backgroundSelected,
              },
            ]}
          >
            <View style={styles.detailItem}>
              <Ionicons
                name="calendar-outline"
                size={17}
                color={theme.textSecondary}
              />
              <View style={styles.detailText}>
                <Text
                  style={[
                    styles.detailLabel,
                    {
                      color: theme.textSecondary,
                    },
                  ]}
                >
                  Adherence period
                </Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>
                  {reportDetails.adherencePeriod}
                </Text>
              </View>
            </View>

            <View style={styles.detailItem}>
              <Ionicons
                name="medical-outline"
                size={17}
                color={theme.textSecondary}
              />
              <View style={styles.detailText}>
                <Text
                  style={[
                    styles.detailLabel,
                    {
                      color: theme.textSecondary,
                    },
                  ]}
                >
                  Medication history
                </Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>
                  {reportDetails.medicationCount}{" "}
                  {reportDetails.medicationCount === 1
                    ? "medication"
                    : "medications"}
                </Text>
              </View>
            </View>

            <View style={styles.detailItem}>
              <Ionicons
                name="time-outline"
                size={17}
                color={theme.textSecondary}
              />
              <View style={styles.detailText}>
                <Text
                  style={[
                    styles.detailLabel,
                    {
                      color: theme.textSecondary,
                    },
                  ]}
                >
                  Generated
                </Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>
                  {reportDetails.generatedAt}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.featureRow}>
            <View
              style={[
                styles.featureChip,
                {
                  backgroundColor: theme.accentMintBg,
                },
              ]}
            >
              <Ionicons
                name="medical-outline"
                size={15}
                color={theme.accentMintIcon}
              />
              <Text
                style={[
                  styles.featureChipText,
                  {
                    color: theme.accentMintIcon,
                  },
                ]}
              >
                History
              </Text>
            </View>

            <View
              style={[
                styles.featureChip,
                {
                  backgroundColor: theme.accentSkyBg,
                },
              ]}
            >
              <Ionicons
                name="stats-chart-outline"
                size={15}
                color={theme.accentSkyIcon}
              />
              <Text
                style={[
                  styles.featureChipText,
                  {
                    color: theme.accentSkyIcon,
                  },
                ]}
              >
                Adherence
              </Text>
            </View>

            <View
              style={[
                styles.featureChip,
                {
                  backgroundColor: theme.accentLavenderBg,
                },
              ]}
            >
              <Ionicons
                name="calendar-outline"
                size={15}
                color={theme.accentLavenderIcon}
              />
              <Text
                style={[
                  styles.featureChipText,
                  {
                    color: theme.accentLavenderIcon,
                  },
                ]}
              >
                Last 7 days
              </Text>
            </View>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            generatedReport
              ? "Regenerate medication usage report"
              : "Generate medication usage report"
          }
          disabled={isBusy}
          onPress={() => {
            void handleGenerate();
          }}
          style={({ pressed }) => [
            styles.generateButton,
            {
              backgroundColor: theme.primary,
              opacity: isBusy ? 0.55 : pressed ? 0.82 : 1,
            },
          ]}
        >
          {operation === "generating" ? (
            <ActivityIndicator
              size="small"
              color={theme.onPrimary}
              accessibilityLabel="Generating medication report"
            />
          ) : (
            <Ionicons
              name={generatedReport ? "refresh-outline" : "document-outline"}
              size={19}
              color={theme.onPrimary}
            />
          )}

          <Text
            style={[
              styles.generateButtonText,
              {
                color: theme.onPrimary,
              },
            ]}
          >
            {operation === "generating"
              ? "Generating report..."
              : generatedReport
                ? "Regenerate report"
                : "Generate report"}
          </Text>
        </Pressable>

        {generatedReport ? (
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Download medication report PDF"
              disabled={isBusy}
              onPress={() => {
                void handleDownload();
              }}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.backgroundSelected,
                  opacity: isBusy ? 0.55 : pressed ? 0.75 : 1,
                },
              ]}
            >
              {operation === "downloading" ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Ionicons
                  name="download-outline"
                  size={19}
                  color={theme.primary}
                />
              )}

              <Text style={[styles.actionButtonText, { color: theme.text }]}>
                {operation === "downloading" ? "Saving..." : "Download"}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share medication report PDF"
              disabled={isBusy}
              onPress={() => {
                void handleShare();
              }}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.backgroundSelected,
                  opacity: isBusy ? 0.55 : pressed ? 0.75 : 1,
                },
              ]}
            >
              {operation === "sharing" ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Ionicons
                  name="share-social-outline"
                  size={19}
                  color={theme.primary}
                />
              )}

              <Text style={[styles.actionButtonText, { color: theme.text }]}>
                {operation === "sharing" ? "Opening..." : "Share"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {feedback ? (
          <View
            accessibilityRole={feedback.kind === "error" ? "alert" : undefined}
            accessible
            accessibilityLabel={feedback.message}
            style={[
              styles.feedback,
              {
                backgroundColor: feedbackBackground,
              },
            ]}
          >
            <Ionicons
              name={feedbackIcon}
              size={19}
              color={feedbackColor}
            />
            <Text
              style={[
                styles.feedbackText,
                {
                  color: feedbackColor,
                },
              ]}
            >
              {feedback.message}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.note, { color: theme.textSecondary }]}>
          The PDF contains information recorded in Moeen and is not a substitute
          for medical advice.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: Spacing.four,
  },
  sectionTitle: {
    marginBottom: 12,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800",
  },
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    shadowColor: "#173E2A",
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.three,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  headerContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  title: {
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
  },
  pdfBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  pdfBadgeText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  featureRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  featureChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  featureChipText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },
  readyPanel: {
    marginTop: Spacing.three,
    borderWidth: 1,
    borderRadius: 15,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  detailText: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600",
  },
  detailValue: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  generateButton: {
    minHeight: 52,
    marginTop: Spacing.three,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  generateButtonText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  actionButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  feedback: {
    marginTop: Spacing.three,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
    padding: Spacing.three,
  },
  feedbackText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  note: {
    marginTop: Spacing.three,
    fontSize: 10,
    lineHeight: 15,
  },
});
