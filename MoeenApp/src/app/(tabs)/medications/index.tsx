import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import {
  getActiveInteractions,
  getTodayMedications,
  getUserMedications,
  MedicationsListApiError,
} from '@/features/medications/list/api';
import { TodayMedicationCard } from '@/features/medications/list/TodayMedicationCard';
import type {
  MedicationSafetyWarning,
  TodayMedication,
  UserMedicationSummary,
} from '@/features/medications/list/types';
import {
  formatFrequency,
  getMostSevereWarning,
  groupWarningsByMedication,
  isSevereWarning,
  WARNING_SEVERITY_LABEL,
  WARNING_TYPE_LABEL,
} from '@/features/medications/list/utils';
import { AddMedicationActionSheet } from '@/features/prescription-scan/AddMedicationActionSheet';

type MedicationFilter = 'Today' | 'All' | 'Active' | 'Archived';

const FILTERS: MedicationFilter[] = ['Today', 'All', 'Active', 'Archived'];

export default function MedicationsScreen() {
  const router = useRouter();
  const theme = useTheme();

  const [query, setQuery] = useState('');
  const [selectedFilter, setSelectedFilter] =
    useState<MedicationFilter>('Today');

  const [todayMeds, setTodayMeds] = useState<TodayMedication[]>([]);
  const [listMeds, setListMeds] = useState<UserMedicationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddSheetVisible, setIsAddSheetVisible] = useState(false);

  const [warningsByMedication, setWarningsByMedication] = useState<
    Map<number, MedicationSafetyWarning>
  >(new Map());

  const loadWarnings = useCallback(async () => {
    let warnings: MedicationSafetyWarning[];
    try {
      warnings = await getActiveInteractions();
    } catch {
      // Keep the last-known warnings — a failed safety check must never
      // look the same as a confirmed empty result.
      return;
    }

    const grouped = groupWarningsByMedication(warnings);

    const mostSevereByMedication = new Map<number, MedicationSafetyWarning>();
    for (const [medicationId, medicationWarnings] of grouped) {
      mostSevereByMedication.set(
        medicationId,
        getMostSevereWarning(medicationWarnings),
      );
    }

    setWarningsByMedication(mostSevereByMedication);
  }, []);

  const loadData = useCallback(async (filter: MedicationFilter) => {
    setIsLoading(true);
    setError(null);

    try {
      if (filter === 'Today') {
        const response = await getTodayMedications();
        setTodayMeds(response);
      } else if (filter === 'All') {
        const response = await getUserMedications();
        setListMeds(response);
      } else {
        const response = await getUserMedications(
          filter === 'Active' ? 'active' : 'archived',
        );
        setListMeds(response);
      }
    } catch (err) {
      const message =
        err instanceof MedicationsListApiError
          ? err.message
          : 'Something went wrong loading medications.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData(selectedFilter);
      void loadWarnings();
    }, [loadData, selectedFilter, loadWarnings]),
  );

  const normalizedQuery = query.trim().toLowerCase();

  const visibleTodayMeds = useMemo(() => {
    if (!normalizedQuery) return todayMeds;

    return todayMeds.filter((med) => {
      const brandName = med.brandName?.toLowerCase() ?? '';
      const genericName = med.genericName?.toLowerCase() ?? '';

      return (
        brandName.includes(normalizedQuery) ||
        genericName.includes(normalizedQuery)
      );
    });
  }, [todayMeds, normalizedQuery]);

  const visibleListMeds = useMemo(() => {
    if (!normalizedQuery) return listMeds;

    return listMeds.filter((med) => {
      const brandName = med.brandName?.toLowerCase() ?? '';
      const genericName = med.genericName?.toLowerCase() ?? '';

      return (
        brandName.includes(normalizedQuery) ||
        genericName.includes(normalizedQuery)
      );
    });
  }, [listMeds, normalizedQuery]);

  const activeCount = useMemo(
    () =>
      selectedFilter === 'Today'
        ? todayMeds.length
        : listMeds.filter((m) => m.status === 'active').length,
    [selectedFilter, todayMeds, listMeds],
  );

  const todayDosesCount = useMemo(
    () => todayMeds.reduce((sum, med) => sum + med.todaySchedule.length, 0),
    [todayMeds],
  );

  const takenTodayCount = useMemo(
    () => todayMeds.reduce((sum, med) => sum + med.summary.taken, 0),
    [todayMeds],
  );

  return (
    <ThemedView
      style={[styles.screen, { backgroundColor: theme.backgroundElement }]}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topHeader}>
            <View style={styles.topHeaderText}>
              <Text style={[styles.title, { color: theme.text }]}>
                Medications
              </Text>

              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                {activeCount} active · {todayDosesCount} doses today
              </Text>
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Add medication"
              activeOpacity={0.85}
              onPress={() => setIsAddSheetVisible(true)}
              style={[
                styles.headerAddButton,
                { backgroundColor: theme.primary },
              ]}
            >
              <Ionicons name="add" size={28} color={theme.onPrimary} />
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.searchContainer,
              {
                backgroundColor: theme.background,
                borderColor: theme.backgroundSelected,
              },
            ]}
          >
            <Ionicons
              name="search-outline"
              size={19}
              color={theme.textSecondary}
            />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search medications..."
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchInput, { color: theme.text }]}
            />
          </View>

          <View style={styles.filters}>
            {FILTERS.map((filter) => {
              const selected = filter === selectedFilter;
              return (
                <TouchableOpacity
                  key={filter}
                  activeOpacity={0.8}
                  onPress={() => setSelectedFilter(filter)}
                  style={[
                    styles.filterButton,
                    {
                      backgroundColor: selected
                        ? theme.primary
                        : theme.background,
                      borderColor: selected
                        ? theme.primary
                        : theme.backgroundSelected,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      {
                        color: selected ? theme.onPrimary : theme.textSecondary,
                      },
                    ]}
                  >
                    {filter}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: theme.background,
                borderColor: theme.backgroundSelected,
              },
            ]}
          >
            <SummaryItem value={String(activeCount)} label="Active" />
            <SummaryItem value={String(todayDosesCount)} label="Doses Today" />
            <SummaryItem value={String(takenTodayCount)} label="Taken" />
          </View>

          {isLoading && (
            <ActivityIndicator
              style={styles.loading}
              color={theme.primary}
              size="large"
            />
          )}

          {!isLoading && error && (
            <Text style={[styles.errorText, { color: theme.danger }]}>
              {error}
            </Text>
          )}

          {!isLoading &&
            !error &&
            selectedFilter === 'Today' &&
            (visibleTodayMeds.length === 0 ? (
              <EmptyState filter={selectedFilter} />
            ) : (
              <View style={styles.medicationList}>
                {visibleTodayMeds.map((medication) => (
                  <TodayMedicationCard
                    key={medication.id}
                    medication={medication}
                    warning={warningsByMedication.get(medication.id)}
                    onPress={() =>
                      router.push({
                        pathname: '/medications/[id]',
                        params: { id: String(medication.id) },
                      })
                    }
                  />
                ))}
              </View>
            ))}

          {!isLoading &&
            !error &&
            selectedFilter !== 'Today' &&
            (visibleListMeds.length === 0 ? (
              <EmptyState filter={selectedFilter} />
            ) : (
              <View style={styles.medicationList}>
                {visibleListMeds.map((medication) => (
                  <MedicationCard
                    key={medication.id}
                    medication={medication}
                    warning={warningsByMedication.get(medication.id)}
                    onPress={() =>
                      router.push({
                        pathname: '/medications/[id]',
                        params: { id: String(medication.id) },
                      })
                    }
                  />
                ))}
              </View>
            ))}
        </ScrollView>

        <AddMedicationActionSheet
          visible={isAddSheetVisible}
          onClose={() => setIsAddSheetVisible(false)}
          onEnterManually={() => {
            setIsAddSheetVisible(false);
            router.push('/medications/search');
          }}
          onScanPrescription={() => {
            setIsAddSheetVisible(false);
            router.push('/medications/prescription-scan');
          }}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function SummaryItem({ value, label }: { value: string; label: string }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.summaryItem,
        { backgroundColor: theme.primaryLight },
      ]}
    >
      <Text style={[styles.summaryValue, { color: theme.primaryDark }]}>
        {value}
      </Text>
      <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
}

function EmptyState({ filter }: { filter: MedicationFilter }) {
  const theme = useTheme();

  const messages: Record<
    MedicationFilter,
    { title: string; subtitle: string }
  > = {
    Today: {
      title: 'No doses scheduled today',
      subtitle: 'Medications with a dose today will show up here.',
    },
    All: {
      title: 'No medications yet',
      subtitle: 'Tap "Add Medication" to get started.',
    },
    Active: {
      title: 'No active medications',
      subtitle: 'Medications you add will appear here.',
    },
    Archived: {
      title: 'No archived medications',
      subtitle: 'Medications you archive will show up here.',
    },
  };

  const { title, subtitle } = messages[filter];

  return (
    <View style={styles.emptyState}>
      <Ionicons name="medical-outline" size={40} color={theme.textSecondary} />
      <Text style={[styles.emptyStateTitle, { color: theme.text }]}>
        {title}
      </Text>
      <Text style={[styles.emptyStateSubtitle, { color: theme.textSecondary }]}>
        {subtitle}
      </Text>
    </View>
  );
}

function MedicationCard({
  medication,
  warning,
  onPress,
}: {
  medication: UserMedicationSummary;
  warning?: MedicationSafetyWarning;
  onPress: () => void;
}) {
  const theme = useTheme();

  const displayName =
    medication.brandName?.trim() ||
    medication.genericName?.trim() ||
    'Unnamed medication';

  const statusBackground =
    medication.status === 'archived'
      ? theme.backgroundSelected
      : theme.primaryLight;
  const statusColor =
    medication.status === 'archived' ? theme.textSecondary : theme.primaryDark;

  const severityKey = warning?.severity.toLowerCase();
  const isSevere = warning ? isSevereWarning(warning.severity) : false;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={
        warning
          ? `View ${displayName} details, has a safety warning`
          : `View ${displayName} details`
      }
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.medicationCard,
        {
          backgroundColor: theme.background,
          borderColor: warning ? theme.danger : theme.backgroundSelected,
          borderWidth: warning ? 2 : 1,
        },
      ]}
    >
      <View
        style={[styles.medicationIcon, { backgroundColor: theme.accentMintBg }]}
      >
        <Ionicons
          name="medical-outline"
          size={23}
          color={theme.accentMintIcon}
        />
      </View>

      <View style={styles.medicationDetails}>
        <View style={styles.medicationHeader}>
          <View style={styles.medicationNameContainer}>
            <View style={styles.medicationNameRow}>
              <Text style={[styles.medicationName, { color: theme.text }]}>
                {displayName}
              </Text>
              {warning && (
                <Ionicons name="warning" size={16} color={theme.danger} />
              )}
            </View>
            <Text
              style={[styles.medicationDose, { color: theme.textSecondary }]}
            >
              {medication.dosageAmount} {medication.dosageUnit}
            </Text>
          </View>

          <View
            style={[styles.statusBadge, { backgroundColor: statusBackground }]}
          >
            <Text style={[styles.statusText, { color: statusColor }]}>
              {medication.status}
            </Text>
          </View>
        </View>

        <Text style={[styles.frequency, { color: theme.textSecondary }]}>
          {formatFrequency(medication.frequency)}
        </Text>

        {medication.instructions && (
          <Text style={[styles.instructions, { color: theme.textSecondary }]}>
            {medication.instructions}
          </Text>
        )}

        {warning && (
          <View
            style={[
              styles.warningChip,
              { backgroundColor: isSevere ? theme.dangerLight : theme.warningLight },
            ]}
          >
            <Text
              style={[
                styles.warningChipText,
                { color: isSevere ? theme.danger : theme.warning },
              ]}
            >
              {WARNING_SEVERITY_LABEL[severityKey ?? ''] ?? warning.severity}
              {' · '}
              {WARNING_TYPE_LABEL[warning.warningType]}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 124,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  searchContainer: {
    height: 50,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#173E2A',
    shadowOpacity: 0.035,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: 9,
    fontSize: 14,
    lineHeight: 20,
  },
  filters: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 7,
    marginBottom: 16,
  },
  filterButton: {
    flex: 1,
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  filterText: { fontSize: 12, fontWeight: '700' },
  summaryCard: {
    flexDirection: 'row',
    borderWidth: 1,
    gap: 8,
    borderRadius: 22,
    padding: 10,
    marginBottom: 18,
    shadowColor: '#153C29',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  summaryItem: {
    flex: 1,
    minHeight: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryValue: { fontSize: 22, lineHeight: 27, fontWeight: '800' },
  summaryLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  loading: { marginTop: Spacing.four },
  errorText: { textAlign: 'center', marginTop: Spacing.four, fontSize: 14 },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: Spacing.two,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: Spacing.one,
  },
  medicationList: { gap: 10 },
  medicationCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    shadowColor: '#173E2A',
    shadowOpacity: 0.045,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  medicationIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.three,
  },
  medicationDetails: { flex: 1 },
  medicationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  medicationNameContainer: { flex: 1 },
  medicationNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  medicationName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  medicationDose: { fontSize: 13, lineHeight: 18 },
  warningChip: {
    marginTop: Spacing.two,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  warningChipText: { fontSize: 11, fontWeight: '700' },
  statusBadge: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  frequency: { fontSize: 13, lineHeight: 18, marginTop: Spacing.two },
  instructions: { fontSize: 12, lineHeight: 17, marginTop: Spacing.one },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },

  topHeaderText: {
    flex: 1,
  },

  headerAddButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.three,
  },
});
