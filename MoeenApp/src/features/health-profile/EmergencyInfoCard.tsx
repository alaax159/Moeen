import { Ionicons } from '@expo/vector-icons';
import { Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { Allergy, PersonalInfo } from './types';

interface EmergencyInfoCardProps {
  criticalAllergy: Allergy | null;
  personalInfo: PersonalInfo;
}

export function EmergencyInfoCard({ criticalAllergy, personalInfo }: EmergencyInfoCardProps) {
  const theme = useTheme();
  const bloodType = personalInfo.bloodType;

  const handleShare = () => {
    const lines = [
      `${personalInfo.firstName} ${personalInfo.lastName}'s Emergency Info`,
      `Blood Type: ${bloodType}`,
      criticalAllergy
        ? `Critical Allergy: ${criticalAllergy.name} (${criticalAllergy.reaction})`
        : 'No critical allergies on file',
      `Emergency contact: ${personalInfo.emergencyContactPhone ?? 'Not set'}`,
    ];
    Share.share({ message: lines.join('\n') }).catch(() => {});
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.dangerLight }]}>
      <View style={styles.header}>
        <View style={styles.headerLabel}>
          <Ionicons name="alert-circle" size={16} color={theme.danger} />
          <Text style={[styles.headerText, { color: theme.danger }]}>EMERGENCY INFO</Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Share emergency info"
          activeOpacity={0.85}
          onPress={handleShare}
          style={[styles.shareButton, { backgroundColor: theme.danger }]}
        >
          <Ionicons name="share-social-outline" size={14} color={theme.onPrimary} />
          <Text style={[styles.shareText, { color: theme.onPrimary }]}>Share</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        <View style={[styles.infoBox, { backgroundColor: theme.background }]}>
          <View style={styles.infoLabel}>
            <Ionicons name="water" size={13} color={theme.textSecondary} />
            <Text style={[styles.infoLabelText, { color: theme.textSecondary }]}>Blood Type</Text>
          </View>
          <Text style={[styles.infoValue, { color: theme.text }]}>{bloodType}</Text>
        </View>

        <View style={[styles.infoBox, { backgroundColor: theme.background }]}>
          <Text style={[styles.infoLabelText, { color: theme.textSecondary }]}>Critical Allergy</Text>
          <Text style={[styles.infoValue, styles.allergyValue, { color: theme.danger }]} numberOfLines={1}>
            {criticalAllergy?.name ?? 'None'}
          </Text>
          {criticalAllergy && (
            <Text style={[styles.allergyReaction, { color: theme.danger }]} numberOfLines={1}>
              {criticalAllergy.reaction}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 16,
    shadowColor: '#8A2F2F',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  headerLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 14,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
  },
  shareText: {
    fontSize: 12,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  infoBox: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
  },
  infoLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  infoLabelText: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 3,
  },
  allergyValue: {
    fontSize: 16,
  },
  allergyReaction: {
    fontSize: 11,
    marginTop: 1,
  },
});
