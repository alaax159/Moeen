import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { DoseStatus, TodayDose } from './types';
import { doseMedicationName, formatScheduleTime } from './utils';

interface TodayDoseCardProps {
  dose: TodayDose;
  onMarkTaken?: () => void;
  onMarkSkip?: () => void;
  isUpdating?: boolean;
  isHighlighted?: boolean;
}

function getStatusStyle(
  status: DoseStatus,
  theme: ReturnType<typeof useTheme>,
) {
  switch (status) {
    case 'taken':
      return {
        background: theme.accentMintBg,
        border: theme.success,
        iconBackground: '#C9F5DC',
        iconColor: theme.success,
        badgeBackground: theme.success,
        badgeColor: theme.onPrimary,
        badgeText: 'Taken',
        icon: 'checkmark' as const,
        // Completed doses recede — flat, no shadow.
        elevated: false,
      };

    case 'missed':
      return {
        background: theme.dangerLight,
        border: theme.danger,
        iconBackground: '#FFD9DD',
        iconColor: theme.danger,
        badgeBackground: '#FFD9DD',
        badgeColor: theme.danger,
        badgeText: 'Missed',
        icon: 'alert-outline' as const,
        // Still needs the user — raised.
        elevated: true,
      };

    case 'skipped':
      return {
        background: theme.backgroundElement,
        border: theme.backgroundSelected,
        iconBackground: theme.backgroundSelected,
        iconColor: theme.textSecondary,
        badgeBackground: theme.backgroundSelected,
        badgeColor: theme.textSecondary,
        badgeText: 'Skipped',
        icon: 'remove' as const,
        elevated: false,
      };

    case 'upcoming':
    default:
      return {
        background: theme.background,
        border: theme.backgroundSelected,
        iconBackground: theme.accentMintBg,
        iconColor: theme.primary,
        badgeBackground: theme.accentMintBg,
        badgeColor: theme.primaryDark,
        badgeText: 'Upcoming',
        icon: 'medical-outline' as const,
        // Still needs the user — raised.
        elevated: true,
      };
  }
}

export function TodayDoseCard({
  dose,
  onMarkTaken,
  onMarkSkip,
  isUpdating = false,
  isHighlighted = false,
}: TodayDoseCardProps) {
  const theme = useTheme();
  const router = useRouter();

  const statusStyle = getStatusStyle(dose.status, theme);
  const isUpcoming = dose.status === 'upcoming';

  const name = doseMedicationName(dose);
  const canNavigate = Boolean(dose.userMedicationId);

  const amount = [dose.dosageAmount, dose.dosageUnit]
    .filter(Boolean)
    .join(' ');
  // amount + form + scheduled time, rendered with Ahmad's meta-line typography.
  const metaLine = [amount, dose.dosageForm, formatScheduleTime(dose.time)]
    .filter(Boolean)
    .join(' · ');

  const openDetails = () => {
    router.push({
      pathname: '/medications/[id]',
      params: { id: String(dose.userMedicationId) },
    });
  };

  const cardBody = (
    <>
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: statusStyle.iconBackground,
          },
        ]}
      >
        <Ionicons
          name={statusStyle.icon}
          size={20}
          color={statusStyle.iconColor}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text
            numberOfLines={1}
            style={[styles.medicationName, { color: theme.text }]}
          >
            {name}
          </Text>

          {canNavigate ? (
            <Ionicons
              name="chevron-forward"
              size={16}
              color={theme.textSecondary}
            />
          ) : null}
        </View>

        <Text
          style={[styles.meta, { color: theme.textSecondary }]}
        >
          {metaLine}
        </Text>

        {dose.instructions ? (
          <Text
            style={[styles.instructions, { color: theme.textSecondary }]}
          >
            {dose.instructions}
          </Text>
        ) : null}

        {isUpcoming && dose.snoozeCount > 0 ? (
          <Text
            style={[styles.instructions, { color: theme.textSecondary }]}
          >
            {dose.snoozeCount === 1 ? 'Snoozed once' : 'Snoozed twice'}
          </Text>
        ) : null}
      </View>
    </>
  );

  return (
    <View
      style={[
        styles.card,
        statusStyle.elevated ? styles.cardRaised : null,
        {
          backgroundColor: statusStyle.background,
          borderColor: isHighlighted ? theme.primary : statusStyle.border,
          borderWidth: isHighlighted ? 2 : 1,
        },
      ]}
    >
      {canNavigate ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View details for ${name}`}
          android_ripple={{ color: theme.backgroundSelected }}
          onPress={openDetails}
          style={styles.pressableArea}
        >
          {cardBody}
        </Pressable>
      ) : (
        <View style={styles.pressableArea}>{cardBody}</View>
      )}

      {isUpcoming ? (
        <View style={styles.actions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Mark ${name} as taken`}
            activeOpacity={0.85}
            disabled={isUpdating}
            onPress={onMarkTaken}
            style={[
              styles.actionButton,
              { backgroundColor: theme.primary },
            ]}
          >
            {isUpdating ? (
              <ActivityIndicator
                size="small"
                color={theme.onPrimary}
              />
            ) : (
              <ThemedText
                type="smallBold"
                themeColor="onPrimary"
                style={styles.actionText}
              >
                Taken
              </ThemedText>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Skip ${name}`}
            activeOpacity={0.85}
            disabled={isUpdating}
            onPress={onMarkSkip}
            style={[
              styles.actionButton,
              styles.skipButton,
              {
                backgroundColor: theme.background,
                borderColor: theme.backgroundSelected,
              },
            ]}
          >
            <ThemedText
              type="smallBold"
              themeColor="textSecondary"
              style={styles.actionText}
            >
              Skip
            </ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: statusStyle.badgeBackground,
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: statusStyle.badgeColor },
            ]}
          >
            {statusStyle.badgeText}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },

  // Ahmad's card shadow, applied only to doses that still need the user
  // (upcoming / missed) — see `elevated` in getStatusStyle.
  cardRaised: {
    shadowColor: '#173E2A',
    shadowOpacity: 0.045,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },

  pressableArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },

  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.three,
  },

  content: {
    flex: 1,
    paddingRight: Spacing.two,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  medicationName: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    letterSpacing: -0.1,
  },

  meta: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 1,
  },

  instructions: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: Spacing.one,
  },

  statusBadge: {
    borderRadius: Radius.control,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },

  actions: {
    gap: Spacing.one,
  },

  actionButton: {
    minWidth: 72,
    borderRadius: Radius.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  skipButton: {
    borderWidth: 1,
  },

  actionText: {
    fontSize: 11,
    lineHeight: 14,
  },
});
