import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { getHealthProfile, HealthProfileApiError, updatePersonalInfo } from '@/features/health-profile/api';
import { FormScreenHeader } from '@/features/health-profile/FormScreenHeader';
import { PersonalInfoForm } from '@/features/health-profile/PersonalInfoForm';
import type { PersonalInfo } from '@/features/health-profile/types';

export default function PersonalInfoEditScreen() {
  const router = useRouter();
  const theme = useTheme();

  const [personalInfo, setPersonalInfo] = useState<PersonalInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPersonalInfo = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const profile = await getHealthProfile();
      setPersonalInfo(profile.personalInfo);
    } catch (err) {
      setError(
        err instanceof HealthProfileApiError
          ? err.message
          : 'Unable to load personal info.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPersonalInfo();
    }, [loadPersonalInfo]),
  );

  const handleSubmit = async (input: PersonalInfo) => {
    await updatePersonalInfo(input);
    router.back();
  };

  return (
    <ThemedView type="backgroundElement" style={styles.flex}>
      <SafeAreaView style={styles.container}>
        <FormScreenHeader title="Edit Personal Info" />

        {isLoading && <ActivityIndicator color={theme.primary} style={styles.loading} />}
        {!isLoading && error && <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>}
        {!isLoading && !error && personalInfo && (
          <PersonalInfoForm initialValues={personalInfo} onSubmit={handleSubmit} />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 16 },
  loading: { marginTop: Spacing.six },
  errorText: { textAlign: 'center', marginTop: Spacing.six, fontSize: 14 },
});
