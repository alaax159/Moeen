import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function MedicationsScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <ThemedView type="backgroundElement" style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ThemedView type="backgroundElement" style={styles.container}>
          <ThemedText style={styles.title}>Medications</ThemedText>
        </ThemedView>

        <TouchableOpacity
          onPress={() => router.push('/medications/search')}
          style={StyleSheet.flatten([styles.fab, { backgroundColor: theme.primary }])}>
          <Text style={styles.fabText}>+ Add Medication</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  title: {
    ...Typography.screenTitle,
  },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 26,
    left: 18,
    minHeight: 54,
    alignSelf: 'center',
    borderRadius: Radius.card,
    paddingVertical: 14,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#173E2A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  fabText: {
    ...Typography.button,
    color: '#FFFFFF',
    fontSize: 15,
  },
});
