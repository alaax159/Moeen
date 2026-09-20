import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type {
  WeeklyDoseDay,
  WeeklyDosesResponse,
} from "@/features/schedule/types";
import {
  getDoseDayPercentage,
  getWeekdayLabel,
  getWeeklyAdherencePercentage,
  orderWeeklyDoseDays,
} from "@/features/schedule/weekly-adherence";

interface MedicationAdherenceChartProps {
  weeklyDoses: WeeklyDosesResponse;
}

interface DayBarProps {
  day: WeeklyDoseDay;
  isCurrentDay: boolean;
}

function DayBar({ day, isCurrentDay }: DayBarProps) {
  const theme = useTheme();
  const percentage = getDoseDayPercentage(day);

  const accessibilityLabel =
    day.scheduled === 0
      ? `${getWeekdayLabel(day.date)}: no scheduled doses`
      : `${getWeekdayLabel(day.date)}: ${percentage}% adherence, ${day.taken} taken, ${day.missed} missed, ${day.skipped} skipped`;

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={styles.dayColumn}
    >
      <Text
        style={[
          styles.dayPercentage,
          {
            color: isCurrentDay ? theme.primary : theme.textSecondary,
          },
        ]}
      >
        {percentage === null ? "—" : `${percentage}%`}
      </Text>

      <View
        style={[
          styles.barTrack,
          {
            backgroundColor: theme.backgroundSelected,
          },
        ]}
      >
        {percentage !== null ? (
          <View
            style={[
              styles.barFill,
              {
                backgroundColor: isCurrentDay
                  ? theme.primary
                  : theme.accentSkyIcon,
                height: `${percentage}%`,
              },
            ]}
          />
        ) : null}
      </View>

      <Text
        style={[
          styles.dayLabel,
          {
            color: isCurrentDay ? theme.primary : theme.textSecondary,
            fontWeight: isCurrentDay ? "800" : "600",
          },
        ]}
      >
        {getWeekdayLabel(day.date)}
      </Text>
    </View>
  );
}

export function MedicationAdherenceChart({
  weeklyDoses,
}: MedicationAdherenceChartProps) {
  const theme = useTheme();

  const orderedDays = useMemo(
    () => orderWeeklyDoseDays(weeklyDoses.days),
    [weeklyDoses.days],
  );

  const adherencePercentage = useMemo(
    () => getWeeklyAdherencePercentage(weeklyDoses.days),
    [weeklyDoses.days],
  );

  const totals = useMemo(
    () =>
      weeklyDoses.days.reduce(
        (summary, day) => ({
          taken: summary.taken + day.taken,
          missed: summary.missed + day.missed,
          skipped: summary.skipped + day.skipped,
          scheduled: summary.scheduled + day.scheduled,
        }),
        {
          taken: 0,
          missed: 0,
          skipped: 0,
          scheduled: 0,
        },
      ),
    [weeklyDoses.days],
  );

  const hasScheduledDoses = totals.scheduled > 0;

  return (
    <View
      accessible={false}
      style={[
        styles.card,
        {
          backgroundColor: theme.background,
          borderColor: theme.backgroundSelected,
        },
      ]}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>
            Weekly adherence
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Last 7 days
          </Text>
        </View>

        <View
          accessibilityLabel={
            adherencePercentage === null
              ? "No scheduled doses this week"
              : `${adherencePercentage}% weekly adherence`
          }
          accessible
          style={[
            styles.percentageBadge,
            {
              backgroundColor: theme.primaryLight,
            },
          ]}
        >
          <Text
            style={[
              styles.percentageBadgeText,
              {
                color: theme.primary,
              },
            ]}
          >
            {adherencePercentage === null
              ? "No doses"
              : `${adherencePercentage}%`}
          </Text>
        </View>
      </View>

      {hasScheduledDoses ? (
        <>
          <View style={styles.chart}>
            {orderedDays.map((day) => (
              <DayBar
                key={day.date}
                day={day}
                isCurrentDay={day.date === weeklyDoses.endDate}
              />
            ))}
          </View>

          <View
            style={[
              styles.divider,
              {
                backgroundColor: theme.backgroundSelected,
              },
            ]}
          />

          <View style={styles.totalsRow}>
            <DoseTotal
              label="Taken"
              value={totals.taken}
              dotColor={theme.primary}
            />

            <DoseTotal
              label="Missed"
              value={totals.missed}
              dotColor={theme.danger}
            />

            <DoseTotal
              label="Skipped"
              value={totals.skipped}
              dotColor={theme.warning}
            />
          </View>
        </>
      ) : (
        <View style={styles.emptyState}>
          <Text
            style={[
              styles.emptyTitle,
              {
                color: theme.text,
              },
            ]}
          >
            No scheduled doses this week
          </Text>

          <Text
            style={[
              styles.emptyText,
              {
                color: theme.textSecondary,
              },
            ]}
          >
            Adherence will appear after scheduled doses are available.
          </Text>
        </View>
      )}
    </View>
  );
}

interface DoseTotalProps {
  label: string;
  value: number;
  dotColor: string;
}

function DoseTotal({ label, value, dotColor }: DoseTotalProps) {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label.toLowerCase()} doses`}
      style={styles.totalItem}
    >
      <View
        style={[
          styles.totalDot,
          {
            backgroundColor: dotColor,
          },
        ]}
      />

      <Text
        style={[
          styles.totalValue,
          {
            color: theme.text,
          },
        ]}
      >
        {value}
      </Text>

      <Text
        style={[
          styles.totalLabel,
          {
            color: theme.textSecondary,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
  },
  percentageBadge: {
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  percentageBadgeText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  chart: {
    height: 150,
    marginTop: Spacing.four,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  dayColumn: {
    flex: 1,
    alignItems: "center",
  },
  dayPercentage: {
    minHeight: 17,
    marginBottom: Spacing.one,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
  },
  barTrack: {
    width: 16,
    height: 90,
    borderRadius: 8,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  barFill: {
    width: "100%",
    borderRadius: 8,
  },
  dayLabel: {
    marginTop: Spacing.two,
    fontSize: 10,
    lineHeight: 14,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.three,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  totalItem: {
    alignItems: "center",
    minWidth: 64,
  },
  totalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: Spacing.one,
  },
  totalValue: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
  },
  totalLabel: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
  },
  emptyState: {
    paddingVertical: Spacing.five,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyText: {
    maxWidth: 260,
    marginTop: Spacing.one,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
});
