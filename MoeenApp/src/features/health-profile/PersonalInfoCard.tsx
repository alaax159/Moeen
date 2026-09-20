import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { PersonalInfo } from './types';
import { formatDate, GENDER_LABEL, KNOWLEDGE_STATUS_LABEL } from './utils';

interface PersonalInfoCardProps {
  personalInfo: PersonalInfo;
  onEdit: () => void;
}

export function PersonalInfoCard({ personalInfo, onEdit }: PersonalInfoCardProps) {
  const theme = useTheme();

  const doctor = personalInfo.doctorName
    ? [personalInfo.doctorName, personalInfo.doctorPhone].filter(Boolean).join(' · ')
    : 'Not set';

  const rows: { label: string; value: string }[] = [
    { label: 'Full name', value: `${personalInfo.firstName} ${personalInfo.lastName}` },
    { label: 'Date of birth', value: formatDate(personalInfo.dateOfBirth) },
    { label: 'Gender', value: GENDER_LABEL[personalInfo.gender] },
    { label: 'Weight', value: `${personalInfo.weightKg} kg` },
    { label: 'Height', value: `${personalInfo.heightCm} cm` },
    { label: 'Primary doctor', value: doctor },
    { label: 'Known allergies', value: KNOWLEDGE_STATUS_LABEL[personalInfo.allergyKnowledgeStatus] },
    { label: 'Known conditions', value: KNOWLEDGE_STATUS_LABEL[personalInfo.conditionKnowledgeStatus] },
  ];

  return (
    <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textSecondary }]}>PERSONAL INFO</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Edit personal info" onPress={onEdit}>
          <Text style={[styles.editText, { color: theme.primary }]}>Edit</Text>
        </TouchableOpacity>
      </View>

      {rows.map((row, index) => (
        <View
          key={row.label}
          style={[
            styles.row,
            index < rows.length - 1 && [styles.rowBorder, { borderBottomColor: theme.backgroundElement }],
          ]}
        >
          <Text style={[styles.label, { color: theme.textSecondary }]}>{row.label}</Text>
          <Text style={[styles.value, { color: theme.text }]}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    shadowColor: '#173E2A',
    shadowOpacity: 0.035,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  editText: {
    fontSize: 14,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 11,
  },
  rowBorder: {
    borderBottomWidth: 1,
  },
  label: {
    flex: 1,
    fontSize: 13,
  },
  value: {
    flex: 1.25,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'right',
  },
});
