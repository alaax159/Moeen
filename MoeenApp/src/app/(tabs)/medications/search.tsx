import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authenticatedFetch } from '@/api/authenticated-fetch';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface MedicationCandidate {
  source: 'existing_db' | 'palestine_moh' | 'dailymed';
  medication: {
    id?: number;
    medicationCatalogId?: number;
    brandName?: string;
    genericName?: string;
    dailyMedId?: string;
    description?: string;
    manufacturer?: string;
    dosageForm?: string;
    isEssential?: boolean;
  };
  verified: 'verified' | 'non-verified';
  verificationSource: 'palestine_moh' | 'dailymed' | 'rxnorm' | 'manual';
  verificationStatus: 'verified' | 'unresolved';
}

const DEFAULT_API_BASE_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:3000'
    : 'http://localhost:3000';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ??
  DEFAULT_API_BASE_URL;

export default function MedicationSearchScreen() {
  const router = useRouter();
  const theme = useTheme();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MedicationCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchMedications = useCallback(async (searchTerm: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/medications/search?query=${encodeURIComponent(
          searchTerm,
        )}`,
      );

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data: MedicationCandidate[] = await response.json();
      setResults(data);
    } catch {
      setError('Something went wrong. Please try again.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const searchTerm = query.trim();

    if (searchTerm.length < 3) {
      return;
    }

    const timeoutId = setTimeout(() => {
      void searchMedications(searchTerm);
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [query, searchMedications]);

  const handleQueryChange = (value: string) => {
    setQuery(value);

    if (value.trim().length < 3) {
      setResults([]);
      setError(null);
    }
  };

  const goToAddForm = (candidate?: MedicationCandidate) => {
    if (!candidate) {
      router.push({
        pathname: '/medications/add',
        params: {},
      });
      return;
    }

    router.push({
      pathname: '/medications/add',
      params: {
        brandName: candidate.medication.brandName ?? '',
        genericName: candidate.medication.genericName ?? '',
        id:
          candidate.source === 'existing_db' &&
          candidate.medication.id !== undefined
            ? String(candidate.medication.id)
            : '',
        // Without this the add form cannot tell a verified Palestinian MOH
        // medicine from something the patient typed by hand, and saves it as
        // a manual entry that loses the catalogue link and the badge.
        medicationCatalogId:
          candidate.source === 'palestine_moh' &&
          candidate.medication.medicationCatalogId !== undefined
            ? String(candidate.medication.medicationCatalogId)
            : '',
        dailyMedId: candidate.medication.dailyMedId ?? '',
        source: candidate.source,
        description: candidate.medication.description ?? '',
      },
    });
  };

  const isTyping = query.trim().length > 0;
  const isSearching = query.trim().length >= 3;

  return (
    <ThemedView
      style={[styles.flex, { backgroundColor: theme.backgroundElement }]}
    >
      <SafeAreaView style={styles.container}>
        <ThemedView
          style={[styles.header, { backgroundColor: theme.backgroundElement }]}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={[
              styles.backButton,
              { backgroundColor: theme.background },
            ]}
          >
            <Ionicons name="arrow-back" size={22} color={theme.text} />
          </TouchableOpacity>

          <ThemedText type="subtitle">Add Medication</ThemedText>
        </ThemedView>

        <ThemedView
          style={[
            styles.searchWrapper,
            {
              backgroundColor: theme.background,
              borderColor: theme.backgroundSelected,
            },
          ]}
        >
          <Ionicons
            name="search"
            size={18}
            color={theme.textSecondary}
            style={styles.searchIcon}
          />

          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search by brand or generic name..."
            placeholderTextColor={theme.textSecondary}
            value={query}
            onChangeText={handleQueryChange}
            autoFocus
          />
        </ThemedView>

        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.helperText}
        >
          Search using the brand name or generic name.
        </ThemedText>

        {!isSearching ? (
          <ThemedView style={styles.idleState}>
            <ThemedView
              style={[
                styles.iconCircle,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <Ionicons
                name="search"
                size={22}
                color={theme.textSecondary}
              />
            </ThemedView>

            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.idleText}
            >
              Search from our internal medicine database
            </ThemedText>
          </ThemedView>
        ) : (
          <>
            {loading && (
              <ActivityIndicator
                style={styles.loader}
                color={theme.primary}
              />
            )}

            {error && (
              <ThemedText
                type="small"
                themeColor="danger"
                style={styles.errorText}
              >
                {error}
              </ThemedText>
            )}

            {!loading && !error && (
              <FlatList
                data={results}
                keyExtractor={(item, index) =>
                  `${item.source}-${
                    item.medication.id ??
                    item.medication.dailyMedId ??
                    item.medication.medicationCatalogId ??
                    item.medication.brandName ??
                    item.medication.genericName ??
                    index
                  }-${index}`
                }
                renderItem={({ item }) => {
                  const { brandName, genericName } = item.medication;

                  const primaryName =
                    brandName ?? genericName ?? 'Unknown medication';

                  return (
                    <TouchableOpacity
                      style={[
                        styles.resultCard,
                        {
                          backgroundColor: theme.background,
                          borderColor: theme.backgroundSelected,
                        },
                      ]}
                      onPress={() => goToAddForm(item)}
                    >
                      <ThemedView
                        type="primaryLight"
                        style={styles.resultIcon}
                      >
                        <Ionicons
                          name="medical-outline"
                          size={20}
                          color={theme.primary}
                        />
                      </ThemedView>

                      <View style={styles.resultText}>
                        <ThemedText type="default">
                          {primaryName}
                        </ThemedText>

                        {brandName && genericName && (
                          <ThemedText
                            type="small"
                            themeColor="textSecondary"
                          >
                            {genericName}
                          </ThemedText>
                        )}

                        {item.verificationStatus === 'verified' && (
                          <ThemedView
                            type="primaryLight"
                            style={styles.badge}
                          >
                            <ThemedText
                              type="smallBold"
                              themeColor="primary"
                            >
                              Verified
                            </ThemedText>
                          </ThemedView>
                        )}
                        {item.source === 'palestine_moh' && (
                          <ThemedView
                            type="primaryLight"
                            style={styles.badge}
                          >
                            <ThemedText
                              type="smallBold"
                              themeColor="primary"
                            >
                              Palestinian MOH
                            </ThemedText>
                          </ThemedView>
                        )}
                        {item.source === 'dailymed' && (
                          <ThemedView
                            type="primaryLight"
                            style={styles.badge}
                          >
                            <ThemedText
                              type="smallBold"
                              themeColor="primary"
                            >
                              DailyMed
                            </ThemedText>
                          </ThemedView>
                        )}
                        {item.medication.isEssential && (
                          <ThemedText type="small" themeColor="primary">
                            Essential medicine
                          </ThemedText>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </>
        )}

        {isTyping && (
          <TouchableOpacity onPress={() => goToAddForm()}>
            <ThemedText
              type="small"
              themeColor="primary"
              style={styles.manualLink}
            >
              {"Couldn't find your medicine? Enter it manually"}
            </ThemedText>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchWrapper: {
    position: 'relative',
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 8,
    shadowColor: '#173E2A',
    shadowOpacity: 0.035,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  searchIcon: {
    position: 'absolute',
    left: Spacing.three,
    top: Spacing.three,
    zIndex: 1,
  },
  searchInput: {
    minHeight: 52,
    paddingVertical: 14,
    paddingLeft: 42,
    paddingRight: 14,
    fontSize: 15,
  },
  helperText: { marginBottom: 18, paddingHorizontal: 2 },
  idleState: {
    alignItems: 'center',
    marginTop: Spacing.six,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  idleText: {
    textAlign: 'center',
    paddingHorizontal: Spacing.five,
  },
  loader: { marginTop: Spacing.four },
  errorText: {
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderRadius: 18,
    shadowColor: '#173E2A',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  resultIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.three,
  },
  resultText: {
    flex: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Spacing.two,
    marginTop: 4,
  },
  manualLink: {
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 20,
    fontWeight: '700',
  },
});
