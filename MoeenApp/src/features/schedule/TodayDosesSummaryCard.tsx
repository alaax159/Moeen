import { StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { TodayDose } from './types';

interface TodayDosesSummaryCardProps {
  doses: TodayDose[];
}

export function TodayDosesSummaryCard({
  doses,
}: TodayDosesSummaryCardProps) {
  const theme = useTheme();

  const total = doses.length;
  const taken = doses.filter(
    (dose) => dose.status === 'taken',
  ).length;

  const remaining = total - taken;

  const percentage =
    total === 0
      ? 0
      : Math.round((taken / total) * 100);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.primary },
      ]}
    >
      <View style={styles.topRow}>
        <Text
          style={[
            styles.title,
            { color: theme.onPrimary },
          ]}
        >
          Today&apos;s doses
        </Text>

        <View style={styles.percentageBadge}>
          <Text style={styles.percentageText}>
            〽 {percentage}% today
          </Text>
        </View>
      </View>

      <View style={styles.countRow}>
        <Text
          style={[
            styles.takenCount,
            { color: theme.onPrimary },
          ]}
        >
          {taken}
        </Text>

        <Text style={styles.totalCount}>
          of {total}
        </Text>
      </View>

      <Text style={styles.subtitle}>
        taken so far
      </Text>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${percentage}%`,
            },
          ]}
        />
      </View>

      <Text style={styles.remainingText}>
        {remaining}{' '}
        {remaining === 1 ? 'dose' : 'doses'} remaining
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 22,
    shadowColor: '#153C29',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  title: {
    fontSize: 14,
    fontWeight: '700',
  },

  percentageBadge: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  percentageText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: Spacing.two,
  },

  takenCount: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -0.8,
  },

  totalCount: {
    marginLeft: 4,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 20,
    fontWeight: '700',
  },

  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    marginTop: -2,
  },

  progressTrack: {
    height: 7,
    borderRadius: 8,
    marginTop: Spacing.three,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
  },

  remainingText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: Spacing.two,
  },
});