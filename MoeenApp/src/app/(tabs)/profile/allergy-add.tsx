import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { addAllergy } from '@/features/health-profile/api';
import { AllergyForm } from '@/features/health-profile/AllergyForm';
import { FormScreenHeader } from '@/features/health-profile/FormScreenHeader';
import type { AllergyInput } from '@/features/health-profile/types';

export default function AllergyAddScreen() {
  const router = useRouter();

  const handleSubmit = async (input: AllergyInput) => {
    await addAllergy(input);
    router.back();
  };

  return (
    <ThemedView type="backgroundElement" style={styles.flex}>
      <SafeAreaView style={styles.container}>
        <FormScreenHeader title="Add Allergy" />
        <AllergyForm submitLabel="Add Allergy" onSubmit={handleSubmit} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 16 },
});
