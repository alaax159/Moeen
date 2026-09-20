import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { getWeeklyDoses } from './api';
import type {
  WeeklyDoseDay,
  WeeklyDosesResponse,
} from './types';
import {
  getDoseDayPercentage,
  getWeeklyAdherencePercentage,
  orderWeeklyDoseDays,
} from './weekly-adherence';

function getDayLabel(date: string) {
  const day = new Date(`${date}T00:00:00`).getDay();

  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][day];
}

function isToday(date: string) {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return date === `${year}-${month}-${day}`;
}

export function WeeklyAdherenceStrip() {
  const theme = useTheme();

  const [weeklyData, setWeeklyData] =
    useState<WeeklyDosesResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const loadWeeklyData = async () => {
      setLoading(true);
      setLoadError(false);

      try {
        const data = await getWeeklyDoses(controller.signal);

        if (!controller.signal.aborted) {
          setWeeklyData(data);
        }
      } catch {
        if (!controller.signal.aborted) {
          setWeeklyData(null);
          setLoadError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadWeeklyData();

    return () => {
      controller.abort();
    };
  }, [retryKey]);

  const weeklyPercentage = useMemo(
    () =>
      weeklyData
        ? getWeeklyAdherencePercentage(weeklyData.days)
        : null,
    [weeklyData],
  );

  const orderedDays = useMemo(() => {
    if (!weeklyData) {
      return [];
    }

    return orderWeeklyDoseDays(weeklyData.days);
  }, [weeklyData]);

  const getIndicatorColor = (day: WeeklyDoseDay) => {
    if (day.scheduled === 0) {
      return theme.backgroundSelected;
    }

       if (day.skipped === day.scheduled && day.missed === 0) {
      return '#60A5FA';
    }
    const percentage = getDoseDayPercentage(day);

    if (percentage === 100) {
      return theme.primary;
    }

    if (percentage !== null && percentage >= 70) {
      return '#4DD17B';
    }

    if (percentage !== null && percentage > 0) {
      return '#F59E0B';
    }

    return '#D4D9E1';
  };

  if (loading) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.background,
            borderColor: theme.backgroundSelected,
          },
        ]}
      >
        <ActivityIndicator
          size="small"
          color={theme.primary}
        />
      </View>
    );
  }

  if (loadError) {
    return (
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
          <Text style={[styles.title, { color: theme.text }]}>This Week</Text>
        </View>

        <View
          accessible
          accessibilityRole="alert"
          style={styles.errorContent}
        >
          <Text style={[styles.errorTitle, { color: theme.text }]}>
            Unable to load adherence
          </Text>

          <Text style={[styles.errorText, { color: theme.textSecondary }]}>
            Check your connection and try again.
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry weekly adherence"
            onPress={() => {
              setRetryKey((value) => value + 1);
            }}
            style={({ pressed }) => [
              styles.retryButton,
              {
                backgroundColor: theme.primary,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!weeklyData) {
    return null;
  }

  return (
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
        <Text
          style={[
            styles.title,
            { color: theme.text },
          ]}
        >
          This Week
        </Text>

        <View
          style={[
            styles.adherenceBadge,
            { backgroundColor: theme.primaryLight },
          ]}
        >
          <View
            style={[
              styles.adherenceDot,
              { backgroundColor: theme.primary },
            ]}
          />

          <Text
            style={[
              styles.adherenceText,
              { color: theme.primary },
            ]}
          >
            {weeklyPercentage === null ? 'No doses' : `${weeklyPercentage}% adherence`}
            
          </Text>
        </View>
      </View>

      <View style={styles.daysRow}>
        {orderedDays.map((day) => (
          <View
            key={day.date}
            style={styles.dayColumn}
          >
            <View
              style={[
                styles.dayIndicator,
                {
                  backgroundColor:
                    getIndicatorColor(day),
                },
              ]}
            />

            <Text
  style={[
    styles.dayLabel,
    {
      color: isToday(day.date)
        ? theme.warning
        : theme.textSecondary,
      fontWeight: isToday(day.date)
        ? '700'
        : '400',
    },
  ]}
>
  {getDayLabel(day.date)}
</Text>
          </View>
        ))}
      </View>

      <View
        style={[
          styles.divider,
          { backgroundColor: theme.backgroundSelected },
        ]}
      />

      <View style={styles.legend}>
        <LegendItem
          color={theme.primary}
          label="100%"
          textColor={theme.textSecondary}
        />

        <LegendItem
          color="#4DD17B"
          label="≥70%"
          textColor={theme.textSecondary}
        />

        <LegendItem
          color="#F59E0B"
          label="<70%"
          textColor={theme.textSecondary}
        />

         <LegendItem
          color="#60A5FA"
          label="Skipped"
          textColor={theme.textSecondary}
        />

        <LegendItem
          color="#D4D9E1"
          label="Missed"
          textColor={theme.textSecondary}
        />
      </View>
    </View>
  );
}

interface LegendItemProps {
  color: string;
  label: string;
  textColor: string;
}

function LegendItem({
  color,
  label,
  textColor,
}: LegendItemProps) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendDot,
          { backgroundColor: color },
        ]}
      />

      <Text
        style={[
          styles.legendText,
          { color: textColor },
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
    padding: 18,
    marginBottom: 22,

    shadowColor: '#173E2A',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    elevation: 2,
  },

  errorContent: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },

  errorTitle: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },

  errorText: {
    marginTop: Spacing.one,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },

  retryButton: {
    marginTop: Spacing.three,
    minHeight: 40,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
  },

  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },

  title: {
    fontSize: 15,
    fontWeight: '800',
  },

  adherenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  adherenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  adherenceText: {
    fontSize: 12,
    fontWeight: '700',
  },

  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  dayColumn: {
    flex: 1,
    alignItems: 'center',
  },

  dayIndicator: {
    width: 30,
    height: 44,
    borderRadius: 15,
  },

  dayLabel: {
    fontSize: 11,
    marginTop: Spacing.two,
  },

  divider: {
    height: 1,
    marginVertical: Spacing.three,
  },

  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },

  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  legendText: {
    fontSize: 10,
  },
});