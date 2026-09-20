import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  createHealthProfile,
  getHealthProfile,
  HealthProfileApiError,
  updatePersonalInfo,
} from '@/features/health-profile/api';
import { PersonalInfoForm } from '@/features/health-profile/PersonalInfoForm';
import type { PersonalInfo } from '@/features/health-profile/types';
import { useTheme } from '@/hooks/use-theme';

export default function PersonalInfoSetupScreen() {
  const theme = useTheme();

  const [isInitializing, setIsInitializing] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let redirected = false;

    async function initializeProfile() {
      try {
        setError(null);

        // POST is safe for both cases:
        // 201 = created
        // 409 = already exists
        await createHealthProfile();

        try {
          await getHealthProfile();

          if (active) {
            redirected = true;
            router.replace('/(tabs)');
          }
        } catch (err) {
          if (
            err instanceof HealthProfileApiError &&
            err.message === 'Personal information is incomplete.'
          ) {
            if (active) {
              setIsReady(true);
            }
            return;
          }

          throw err;
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to prepare your health profile.',
          );
        }
      } finally {
        if (active && !redirected) {
          setIsInitializing(false);
        }
      }
    }

    void initializeProfile();

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (input: PersonalInfo) => {
    await updatePersonalInfo(input);
    router.replace('/(tabs)');
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.container}>
        {isInitializing && (
          <ActivityIndicator
            size="large"
            color={theme.primary}
            style={styles.loading}
          />
        )}

        {!isInitializing && error && (
          <>
            <Text style={[styles.title, { color: theme.text }]}>
              Profile setup
            </Text>

            <Text style={[styles.error, { color: theme.danger }]}>
              {error}
            </Text>
          </>
        )}

        {!isInitializing && !error && isReady && (
          <>
            <Text style={[styles.title, { color: theme.text }]}>
              Complete your profile
            </Text>

            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Add your personal and health information to finish setting up your account.
            </Text>

            <PersonalInfoForm
              initialValues={{}}
              onSubmit={handleSubmit}
            />
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  loading: {
    marginTop: Spacing.six,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: Spacing.one,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: Spacing.two,
  },
  error: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: Spacing.three,
  },
});
