import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import {
  formatFrequency,
  formatTime,
  getWorstStatus,
  isSevereWarning,
  STATUS_ICON,
  WARNING_SEVERITY_LABEL,
  WARNING_TYPE_LABEL,
} from './utils';
import type { MedicationSafetyWarning, TodayMedication, TodayScheduleStatus } from './types';

interface TodayMedicationCardProps {
  medication: TodayMedication;
  warning?: MedicationSafetyWarning;
  onPress: () => void;
}

function getStatusColors(
  status: TodayScheduleStatus,
  theme: ReturnType<typeof useTheme>,
) {
  switch (status) {
    case 'missed':
      return { bg: theme.dangerLight, fg: theme.danger };
    case 'taken':
      return { bg: theme.primaryLight, fg: theme.primaryDark };
    case 'skipped':
      return { bg: theme.backgroundSelected, fg: theme.textSecondary };
    case 'upcoming':
    default:
      return { bg: theme.accentSkyBg, fg: theme.accentSkyIcon };
  }
}

function formatSummaryLine(summary: TodayMedication['summary']): string {
  const parts: string[] = [];

  if (summary.taken > 0) parts.push(`${summary.taken} Taken`);
  if (summary.missed > 0) parts.push(`${summary.missed} Missed`);
  if (summary.upcoming > 0) parts.push(`${summary.upcoming} Upcoming`);
  if (summary.skipped > 0) parts.push(`${summary.skipped} Skipped`);

  return parts.join(' · ');
}

export function TodayMedicationCard({
  medication,
  warning,
  onPress,
}: TodayMedicationCardProps) {
  const theme = useTheme();

  const displayName =
    medication.brandName?.trim() ||
    medication.genericName?.trim() ||
    'Unnamed medication';

  const worstStatus = getWorstStatus(
    medication.todaySchedule.map((entry) => entry.status),
  );
  const badgeColors = getStatusColors(worstStatus, theme);

  const severityKey = warning?.severity.toLowerCase();
  const isSevere = warning ? isSevereWarning(warning.severity) : false;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={
        warning
          ? `View ${displayName} details, has a safety warning`
          : `View ${displayName} details`
      }
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: theme.background,
          borderColor: warning ? theme.danger : theme.backgroundSelected,
          borderWidth: warning ? 2 : 1,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.nameContainer}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: theme.text }]}>
              {displayName}
            </Text>
            {warning && (
              <Ionicons name="warning" size={16} color={theme.danger} />
            )}
          </View>
          <Text style={[styles.dose, { color: theme.textSecondary }]}>
            {medication.dosageAmount} {medication.dosageUnit}
          </Text>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: badgeColors.bg }]}>
          <Text style={[styles.statusText, { color: badgeColors.fg }]}>
            {worstStatus}
          </Text>
        </View>
      </View>

      <Text style={[styles.frequency, { color: theme.textSecondary }]}>
        {formatFrequency(medication.frequency)}
      </Text>
      {medication.instructions && (
        <Text style={[styles.instructions, { color: theme.textSecondary }]}>
          {medication.instructions}
        </Text>
      )}

      {warning && (
        <View
          style={[
            styles.warningChip,
            { backgroundColor: isSevere ? theme.dangerLight : theme.warningLight },
          ]}
        >
          <Text
            style={[
              styles.warningChipText,
              { color: isSevere ? theme.danger : theme.warning },
            ]}
          >
            {WARNING_SEVERITY_LABEL[severityKey ?? ''] ?? warning.severity}
            {' · '}
            {WARNING_TYPE_LABEL[warning.warningType]}
          </Text>
        </View>
      )}

      <View style={styles.timesRow}>
        {medication.todaySchedule.map((entry) => {
          const colors = getStatusColors(entry.status, theme);
          return (
            <View
              key={entry.scheduleTimeId}
              style={[styles.timeChip, { backgroundColor: colors.bg }]}
            >
              <Text style={[styles.timeChipText, { color: colors.fg }]}>
                {STATUS_ICON[entry.status]} {formatTime(entry.time)}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={[styles.summaryLine, { color: theme.textSecondary }]}>
        {formatSummaryLine(medication.summary)}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    shadowColor: '#173E2A',
    shadowOpacity: 0.045,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  instructions: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: Spacing.one,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nameContainer: { flex: 1 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  name: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  dose: { fontSize: 13, lineHeight: 18 },
  warningChip: {
    marginTop: Spacing.two,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  warningChipText: { fontSize: 11, fontWeight: '700' },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  frequency: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: Spacing.two,
  },
  timesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  timeChip: {
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  timeChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  summaryLine: {
    fontSize: 12,
    marginTop: Spacing.two,
  },
});
