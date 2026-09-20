import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { getUserMedications } from "@/features/medications/list/api";
import type { UserMedicationSummary } from "@/features/medications/list/types";
import { MedicationAdherenceChart } from "@/features/reports/MedicationAdherenceChart";
import { MedicationReportActionsCard } from "@/features/reports/MedicationReportActionsCard";
import {
  summarizeMedicationHistory,
  summarizeWeeklyDoses,
} from "@/features/reports/medication-history-summary";
import { getWeeklyDoses } from "@/features/schedule/api";
import type { WeeklyDosesResponse } from "@/features/schedule/types";

type SummaryIconName =
  | "medical-outline"
  | "archive-outline"
  | "checkmark-circle-outline"
  | "alert-circle-outline";

interface SummaryCardProps {
  label: string;
  value: string;
  detail: string;
  icon: SummaryIconName;
  iconBackground: string;
  iconColor: string;
  isLoading?: boolean;
  error?: string | null;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function SummaryCard({
  label,
  value,
  detail,
  icon,
  iconBackground,
  iconColor,
  isLoading = false,
  error = null,
}: SummaryCardProps) {
  const theme = useTheme();

  const accessibilityValue = error
    ? `${label}: unavailable`
    : isLoading
      ? `${label}: loading`
      : `${label}: ${value}. ${detail}`;

  return (
    <View
      accessible
      accessibilityLabel={accessibilityValue}
      style={[
        styles.summaryCard,
        {
          backgroundColor: theme.background,
          borderColor: theme.backgroundSelected,
        },
      ]}
    >
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: iconBackground,
          },
        ]}
      >
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>

      <View style={styles.cardContent}>
        <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>
          {label}
        </Text>

        {isLoading ? (
          <ActivityIndicator
            accessibilityLabel={`Loading ${label.toLowerCase()}`}
            size="small"
            color={theme.primary}
            style={styles.cardLoader}
          />
        ) : error ? (
          <>
            <Text style={[styles.cardValue, { color: theme.textSecondary }]}>
              —
            </Text>
            <Text
              numberOfLines={2}
              style={[styles.cardError, { color: theme.danger }]}
            >
              Unable to load
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.cardValue, { color: theme.text }]}>
              {value}
            </Text>
            <Text style={[styles.cardDetail, { color: theme.textSecondary }]}>
              {detail}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

export default function ReportsScreen() {
  const theme = useTheme();

  const [medications, setMedications] = useState<
    UserMedicationSummary[] | null
  >(null);
  const [weeklyDoses, setWeeklyDoses] = useState<WeeklyDosesResponse | null>(
    null,
  );

  const [activeMedicationsError, setActiveMedicationsError] = useState<
    string | null
  >(null);
  const [archivedMedicationsError, setArchivedMedicationsError] = useState<
    string | null
  >(null);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);

  const [isLoadingMedications, setIsLoadingMedications] = useState(true);
  const [isLoadingWeekly, setIsLoadingWeekly] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const requestGenerationRef = useRef(0);
  const currentRequestRef = useRef<AbortController | null>(null);

  const loadReports = useCallback(async (refresh = false) => {
    currentRequestRef.current?.abort();

    const controller = new AbortController();
    currentRequestRef.current = controller;

    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;

    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsRefreshing(false);
      setIsLoadingMedications(true);
      setIsLoadingWeekly(true);
    }

    setActiveMedicationsError(null);
    setArchivedMedicationsError(null);
    setWeeklyError(null);

    const [activeResult, archivedResult, weeklyResult] =
      await Promise.allSettled([
        getUserMedications("active", controller.signal),
        getUserMedications("archived", controller.signal),
        getWeeklyDoses(controller.signal),
      ]);

    if (
      requestGenerationRef.current !== generation ||
      controller.signal.aborted
    ) {
      return;
    }

    const nextMedications: UserMedicationSummary[] = [];
    let hasMedicationData = false;

    if (activeResult.status === "fulfilled") {
      nextMedications.push(...activeResult.value);
      hasMedicationData = true;
    } else {
      setActiveMedicationsError(
        errorMessage(
          activeResult.reason,
          "Unable to load current medications.",
        ),
      );
    }

    if (archivedResult.status === "fulfilled") {
      nextMedications.push(...archivedResult.value);
      hasMedicationData = true;
    } else {
      setArchivedMedicationsError(
        errorMessage(
          archivedResult.reason,
          "Unable to load past medications.",
        ),
      );
    }

    setMedications(hasMedicationData ? nextMedications : null);

    if (weeklyResult.status === "fulfilled") {
      setWeeklyDoses(weeklyResult.value);
    } else {
      setWeeklyError(
        errorMessage(weeklyResult.reason, "Unable to load weekly adherence."),
      );
    }

    setIsLoadingMedications(false);
    setIsLoadingWeekly(false);
    setIsRefreshing(false);

    if (currentRequestRef.current === controller) {
      currentRequestRef.current = null;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadReports();

      return () => {
        requestGenerationRef.current += 1;
        currentRequestRef.current?.abort();
        currentRequestRef.current = null;
      };
    }, [loadReports]),
  );

  const medicationSummary = useMemo(
    () =>
      medications === null ? null : summarizeMedicationHistory(medications),
    [medications],
  );

  const weeklySummary = useMemo(
    () => (weeklyDoses === null ? null : summarizeWeeklyDoses(weeklyDoses)),
    [weeklyDoses],
  );

  const adherenceValue =
    weeklySummary?.adherencePercentage === null ||
    weeklySummary?.adherencePercentage === undefined
      ? "—"
      : `${weeklySummary.adherencePercentage}%`;

  const adherenceDetail =
    weeklySummary?.scheduled === 0
      ? "No scheduled doses this week"
      : `${weeklySummary?.taken ?? 0} of ${weeklySummary?.scheduled ?? 0} taken`;

  return (
    <ThemedView
      style={[
        styles.screen,
        {
          backgroundColor: theme.backgroundElement,
        },
      ]}
    >
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                void loadReports(true);
              }}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Reports</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Your medication history at a glance
            </Text>
          </View>

          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Medication Summary
          </Text>

          <View style={styles.summaryGrid}>
            <SummaryCard
              label="Current"
              value={String(medicationSummary?.current ?? 0)}
              detail={
                medicationSummary?.current === 1
                  ? "ongoing medication"
                  : "ongoing medications"
              }
              icon="medical-outline"
              iconBackground={theme.accentMintBg}
              iconColor={theme.accentMintIcon}
              isLoading={isLoadingMedications && medications === null}
              error={activeMedicationsError}
            />

            <SummaryCard
              label="Past"
              value={String(medicationSummary?.past ?? 0)}
              detail={
                medicationSummary?.past === 1
                  ? "past medication"
                  : "past medications"
              }
              icon="archive-outline"
              iconBackground={theme.accentLavenderBg}
              iconColor={theme.accentLavenderIcon}
              isLoading={isLoadingMedications && medications === null}
              error={archivedMedicationsError}
            />

            <SummaryCard
              label="Adherence"
              value={adherenceValue}
              detail={adherenceDetail}
              icon="checkmark-circle-outline"
              iconBackground={theme.accentSkyBg}
              iconColor={theme.accentSkyIcon}
              isLoading={isLoadingWeekly && weeklyDoses === null}
              error={weeklyDoses === null ? weeklyError : null}
            />

            <SummaryCard
              label="Missed"
              value={String(weeklySummary?.missed ?? 0)}
              detail={
                weeklySummary?.missed === 1
                  ? "dose missed this week"
                  : "doses missed this week"
              }
              icon="alert-circle-outline"
              iconBackground={theme.accentPeachBg}
              iconColor={theme.accentPeachIcon}
              isLoading={isLoadingWeekly && weeklyDoses === null}
              error={weeklyDoses === null ? weeklyError : null}
            />
          </View>

          {medications !== null &&
          medications.length === 0 &&
          !activeMedicationsError &&
          !archivedMedicationsError ? (
            <View
              accessible
              accessibilityLabel="No medication history yet"
              style={[
                styles.emptyHistory,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.backgroundSelected,
                },
              ]}
            >
              <Ionicons
                name="document-text-outline"
                size={24}
                color={theme.textSecondary}
              />
              <View style={styles.emptyHistoryText}>
                <Text
                  style={[
                    styles.emptyHistoryTitle,
                    {
                      color: theme.text,
                    },
                  ]}
                >
                  No medication history yet
                </Text>
                <Text
                  style={[
                    styles.emptyHistorySubtitle,
                    {
                      color: theme.textSecondary,
                    },
                  ]}
                >
                  Added medications will appear in your history summary.
                </Text>
              </View>
            </View>
          ) : null}

          <MedicationReportActionsCard />

          <Text
            style={[
              styles.visualizationTitle,
              {
                color: theme.text,
              },
            ]}
          >
            Adherence Overview
          </Text>

          {isLoadingWeekly && weeklyDoses === null ? (
            <View
              style={[
                styles.visualizationLoading,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.backgroundSelected,
                },
              ]}
            >
              <ActivityIndicator
                accessibilityLabel="Loading weekly adherence"
                size="small"
                color={theme.primary}
              />
            </View>
          ) : weeklyError && weeklyDoses === null ? (
            <View
              accessibilityRole="alert"
              style={[
                styles.visualizationError,
                {
                  backgroundColor: theme.dangerLight,
                  borderColor: theme.danger,
                },
              ]}
            >
              <Text
                style={[
                  styles.visualizationErrorText,
                  {
                    color: theme.danger,
                  },
                ]}
              >
                Weekly adherence is temporarily unavailable.
              </Text>
            </View>
          ) : weeklyDoses ? (
            <MedicationAdherenceChart weeklyDoses={weeklyDoses} />
          ) : null}

          {activeMedicationsError ||
          archivedMedicationsError ||
          weeklyError ? (
            <View
              accessibilityRole="alert"
              style={[
                styles.partialError,
                {
                  backgroundColor: theme.dangerLight,
                  borderColor: theme.danger,
                },
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={theme.danger}
              />
              <View style={styles.partialErrorContent}>
                <Text
                  style={[
                    styles.partialErrorText,
                    {
                      color: theme.danger,
                    },
                  ]}
                >
                  Some report data could not be refreshed. Previously loaded
                  data is kept when available.
                </Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading report data"
                  onPress={() => {
                    void loadReports();
                  }}
                  style={[
                    styles.retryButton,
                    {
                      backgroundColor: theme.danger,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.retryButtonText,
                      {
                        color: theme.onPrimary,
                      },
                    ]}
                  >
                    Try again
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingBottom: 96,
  },
  header: {
    marginTop: 14,
    marginBottom: 22,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: Spacing.one,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    marginBottom: 12,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summaryCard: {
    width: "48%",
    minHeight: 148,
    borderWidth: 1,
    borderRadius: 20,
    padding: 15,
    shadowColor: "#173E2A",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.three,
  },
  cardContent: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  cardValue: {
    marginTop: 5,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  cardDetail: {
    marginTop: Spacing.one,
    fontSize: 12,
    lineHeight: 17,
  },
  cardError: {
    marginTop: Spacing.one,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  cardLoader: {
    alignSelf: "flex-start",
    marginTop: Spacing.three,
  },
  emptyHistory: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  emptyHistoryText: {
    flex: 1,
  },
  emptyHistoryTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  emptyHistorySubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 18,
  },
  visualizationTitle: {
    marginTop: Spacing.four,
    marginBottom: Spacing.three,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
  },
  visualizationLoading: {
    minHeight: 180,
    borderWidth: 1,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  visualizationError: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.three,
  },
  visualizationErrorText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    textAlign: "center",
  },
  partialError: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
    marginTop: Spacing.three,
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
  },
  partialErrorContent: {
    flex: 1,
  },
  partialErrorText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  retryButton: {
    alignSelf: "flex-start",
    marginTop: Spacing.two,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  retryButtonText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
});
