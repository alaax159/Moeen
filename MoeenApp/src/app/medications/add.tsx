import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Typography } from '@/constants/theme';

export default function AddMedicationForm() {
  return (
    <ThemedView type="backgroundElement" style={styles.flex}>
      <SafeAreaView style={styles.container}>
        <ThemedText style={styles.title}>Add Medication</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
          Coming soon
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  title: {
    ...Typography.pageTitle,
  },
  subtitle: { marginTop: Spacing.two },
});
