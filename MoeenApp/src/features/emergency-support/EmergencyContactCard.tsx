import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { EmergencyContactRecord } from './contacts-types';

interface EmergencyContactCardProps {
  contact: EmergencyContactRecord;
  onEdit: () => void;
  onDelete: () => void;
  onSetPrimary: () => void;
}

export function EmergencyContactCard({
  contact,
  onEdit,
  onDelete,
  onSetPrimary,
}: EmergencyContactCardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.background, borderColor: theme.backgroundSelected },
      ]}
    >
      <View style={styles.details}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: theme.text }]}>{contact.name}</Text>
          {contact.isPrimary && (
            <View style={[styles.badge, { backgroundColor: theme.primaryLight }]}>
              <Text style={[styles.badgeText, { color: theme.primary }]}>
                PRIMARY
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.phone, { color: theme.textSecondary }]}>
          {contact.phone}
        </Text>
        {contact.relationship ? (
          <Text style={[styles.relationship, { color: theme.textSecondary }]}>
            {contact.relationship}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        {!contact.isPrimary && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Set ${contact.name} as primary`}
            activeOpacity={0.8}
            onPress={onSetPrimary}
            style={[styles.actionButton, { backgroundColor: theme.backgroundElement }]}
          >
            <Ionicons name="star-outline" size={15} color={theme.primary} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Edit ${contact.name}`}
          activeOpacity={0.8}
          onPress={onEdit}
          style={[styles.actionButton, { backgroundColor: theme.backgroundElement }]}
        >
          <Ionicons name="pencil" size={15} color={theme.text} />
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Delete ${contact.name}`}
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
  badge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  phone: { fontSize: 13 },
  relationship: { fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  actionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
