import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

interface SectionHeaderProps {
  title: string;
  onAdd: () => void;
}

export function SectionHeader({ title, onAdd }: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <Text style={[styles.title, { color: theme.textSecondary }]}>{title}</Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Add ${title.toLowerCase()}`}
        activeOpacity={0.8}
        onPress={onAdd}
        style={styles.addButton}
      >
        <Ionicons name="add" size={16} color={theme.primary} />
        <Text style={[styles.addText, { color: theme.primary }]}>Add</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  addText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
