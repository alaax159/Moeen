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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface MedicationCandidate {
  id: number;
  brandName: string;
  genericName: string | null;
  verified: string;
  dailyMedId: string | null;
  description: string | null;
  createdAt: string;
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

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    const timeoutId = setTimeout(() => searchMedications(query), 400);
    return () => clearTimeout(timeoutId);
  }, [query]);

  const searchMedications = useCallback(async (searchTerm: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/medications/search?query=${encodeURIComponent(searchTerm)}`
      );
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const goToAddForm = (candidate?: MedicationCandidate) => {
    router.push({
      pathname: '/medications/add',
      params: candidate
        ? { id: String(candidate.id), name: candidate.brandName, dailyMedId: candidate.dailyMedId ?? '' }
        : { name: query },
    });
  };

  const isTyping = query.trim().length > 0;
  const isSearching = query.trim().length >= 3;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.container}>
        <ThemedView style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons name="arrow-back" size={22} color={theme.text} />
          </TouchableOpacity>
          <ThemedText type="subtitle">Add Medication</ThemedText>
        </ThemedView>

        <ThemedView style={[styles.searchWrapper, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="search" size={18} color={theme.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Type medication name..."
            placeholderTextColor={theme.textSecondary}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </ThemedView>
        <ThemedText type="small" themeColor="textSecondary" style={styles.helperText}>
          Type the name exactly as written on your prescription.
        </ThemedText>

        {!isSearching ? (
          <ThemedView style={styles.idleState}>
            <ThemedView style={[styles.iconCircle, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="search" size={22} color={theme.textSecondary} />
            </ThemedView>
            <ThemedText type="small" themeColor="textSecondary" style={styles.idleText}>
              Search from our internal medicine database
            </ThemedText>
          </ThemedView>
        ) : (
          <>
            {loading && <ActivityIndicator style={styles.loader} color={theme.primary} />}
            {error && (
              <ThemedText type="small" themeColor="danger" style={styles.errorText}>
                {error}
              </ThemedText>
            )}
            {!loading && !error && (
              <FlatList
                data={results}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.resultCard, { borderBottomColor: theme.backgroundElement }]}
                    onPress={() => goToAddForm(item)}>
                    <ThemedText type="default">{item.brandName}</ThemedText>
                    {item.genericName && (
                      <ThemedText type="small" themeColor="textSecondary">{item.genericName}</ThemedText>
                    )}
                    {item.verified === 'verified' && (
                      <ThemedView type="primaryLight" style={styles.badge}>
                        <ThemedText type="smallBold" themeColor="primary">Verified</ThemedText>
                      </ThemedView>
                    )}
                  </TouchableOpacity>
                )}
              />
            )}
          </>
        )}

        {isTyping && (
          <TouchableOpacity onPress={() => goToAddForm()}>
            <ThemedText type="small" themeColor="primary" style={styles.manualLink}>
              Couldn't find your medicine? Enter it manually
            </ThemedText>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, padding: Spacing.four },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.four, gap: Spacing.three },
  backButton: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  searchWrapper: { position: 'relative', borderRadius: Spacing.three, marginBottom: Spacing.two },
  searchIcon: { position: 'absolute', left: Spacing.three, top: Spacing.three, zIndex: 1 },
  searchInput: { paddingVertical: Spacing.three, paddingLeft: 40, paddingRight: Spacing.three, fontSize: 16 },
  helperText: { marginBottom: Spacing.four },
  idleState: { alignItems: 'center', marginTop: Spacing.six },
  iconCircle: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.three },
  idleText: { textAlign: 'center', paddingHorizontal: Spacing.five },
  loader: { marginTop: Spacing.four },
  errorText: { textAlign: 'center', marginTop: Spacing.four },
  resultCard: { paddingVertical: Spacing.three, borderBottomWidth: 1 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Spacing.two,
    marginTop: 4,
  },
  manualLink: { textAlign: 'center', marginTop: Spacing.four },
});

