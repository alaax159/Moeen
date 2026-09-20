import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { ChronicCondition } from './types';
import { formatDate } from './utils';
import { VerifiedBadge } from './VerifiedBadge';

interface ConditionCardProps {
  condition: ChronicCondition;
  onDelete: () => void;
}

export function ConditionCard({ condition, onDelete }: ConditionCardProps) {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}>
      <View style={styles.details}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: theme.text }]}>{condition.name}</Text>
          <VerifiedBadge isVerified={Boolean(condition.externalId)} />
        </View>
        <Text style={[styles.diagnosed, { color: theme.textSecondary }]}>
          Diagnosed {formatDate(condition.diagnosisDate)}
        </Text>
        {condition.notes && (
          <Text style={[styles.notes, { color: theme.textSecondary }]} numberOfLines={2}>
            {condition.notes}
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Delete ${condition.name}`}
          activeOpacity={0.8}
          onPress={onDelete}
          style={[styles.actionButton, { backgroundColor: theme.dangerLight }]}
        >
          <Ionicons name="trash" size={15} color={theme.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    shadowColor: '#173E2A',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  details: { flex: 1, marginRight: Spacing.two },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: 4,
  },
  name: { fontSize: 15, lineHeight: 20, fontWeight: '800' },
  diagnosed: { fontSize: 13 },
  notes: { fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  actionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
