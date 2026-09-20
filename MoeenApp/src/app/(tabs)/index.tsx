import { Ionicons } from '@expo/vector-icons';
import { WeeklyAdherenceStrip } from '@/features/schedule/WeeklyAdherenceStrip';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { TodayDosesSummaryCard } from '@/features/schedule/TodayDosesSummaryCard';
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import {
  getTodayDoses,
  markDoseSkipped,
  markDoseTaken,
} from '@/features/schedule/api';
import { TodayDoseCard } from '@/features/schedule/TodayDoseCard';
import type { DoseStatus, TodayDose } from '@/features/schedule/types';
import {
  bucketTodayDoses,
  type DoseBucket,
  type DoseBucketKey,
} from '@/features/schedule/utils';
import { ActiveInteractionsCard } from '@/features/medication-safety/ActiveInteractionsCard';
import { EmergencyHelpIconButton } from '@/features/emergency-support/EmergencyHelpIconButton';

const SECTION_ICON: Record<
  DoseBucketKey,
  ComponentProps<typeof Ionicons>['name']
> = {
  'up-next': 'arrow-forward',
  completed: 'checkmark-done-outline',
  missed: 'alert-circle-outline',
};

export default function HomeScreen() {
  const theme = useTheme();

  const params = useLocalSearchParams<{ scheduleTimeId?: string }>();

  const targetScheduleTimeId =
    typeof params.scheduleTimeId === 'string' && params.scheduleTimeId !== ''
      ? Number(params.scheduleTimeId)
      : null;

  const sectionListRef = useRef<SectionList<TodayDose, DoseBucket>>(null);
  const scrolledForIdRef = useRef<number | null>(null);
  const pendingScrollRef = useRef<{
    scheduleTimeId: number;
    sectionIndex: number;
    itemIndex: number;
  } | null>(null);

  const [doses, setDoses] = useState<TodayDose[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadDoses = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const data = await getTodayDoses();
        setDoses(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load today's schedule.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void loadDoses();
    }, [loadDoses]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextAppState) => {
        if (nextAppState === 'active') {
          void loadDoses();
        }
      },
    );

    return () => subscription.remove();
  }, [loadDoses]);

  const handleDoseAction = useCallback(
    async (
      scheduleTimeId: number,
      action: (id: number) => Promise<void>,
      nextStatus: DoseStatus,
    ) => {
      const previousDoses = doses;

      setDoses((current) =>
        current.map((dose) =>
          dose.scheduleTimeId === scheduleTimeId
            ? { ...dose, status: nextStatus }
            : dose,
        ),
      );
      setUpdatingId(scheduleTimeId);

      try {
        await action(scheduleTimeId);
      } catch (err) {
        setDoses(previousDoses);
        Alert.alert(
          'Unable to update dose',
          err instanceof Error
            ? err.message
            : 'Please try again.',
        );
      } finally {
        setUpdatingId(null);
      }
    },
    [doses],
  );

  const sections = useMemo(
    () => bucketTodayDoses(doses),
    [doses],
  );

  const missedCount = useMemo(
    () => doses.filter((dose) => dose.status === 'missed').length,
    [doses],
  );

  useEffect(() => {
    if (targetScheduleTimeId === null) {
      scrolledForIdRef.current = null;
      pendingScrollRef.current = null;
      return;
    }

    if (scrolledForIdRef.current === targetScheduleTimeId) {
      return;
    }

    if (pendingScrollRef.current?.scheduleTimeId === targetScheduleTimeId) {
      return;
    }

    if (loading || sections.length === 0) {
      return;
    }

    let sectionIndex = -1;
    let itemIndex = -1;

    for (let i = 0; i < sections.length; i++) {
      const found = sections[i].data.findIndex(
        (d) => d.scheduleTimeId === targetScheduleTimeId,
      );
      if (found !== -1) {
        sectionIndex = i;
        itemIndex = found;
        break;
      }
    }

    if (sectionIndex === -1) {
      return;
    }

    pendingScrollRef.current = {
      scheduleTimeId: targetScheduleTimeId,
      sectionIndex,
      itemIndex,
    };
  }, [targetScheduleTimeId, loading, sections]);

  const handleContentReady = useCallback(() => {
    const pending = pendingScrollRef.current;

    if (!pending) {
      return;
    }

    sectionListRef.current?.scrollToLocation({
      sectionIndex: pending.sectionIndex,
      itemIndex: pending.itemIndex,
      animated: true,
      viewPosition: 0.3,
    });
    scrolledForIdRef.current = pending.scheduleTimeId;
    pendingScrollRef.current = null;
  }, []);

  const now = new Date();

const hour = now.getHours();

const greeting =
  hour < 12
    ? 'Good morning'
    : hour < 18
      ? 'Good afternoon'
      : 'Good evening';

const formattedDate = now.toLocaleDateString(
  undefined,
  {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  },
);

  const headerContent = (
    <>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text
            style={[
              styles.greeting,
              { color: theme.textSecondary },
            ]}
          >
            {greeting},
          </Text>

          <Text
            style={[
              styles.welcome,
              { color: theme.text },
            ]}
          >
            Welcome 👋
          </Text>

          <Text
            style={[
              styles.date,
              { color: theme.textSecondary },
            ]}
          >
            {formattedDate}
          </Text>
        </View>

        <EmergencyHelpIconButton />
      </View>

      <TodayDosesSummaryCard doses={doses} />

      <ActiveInteractionsCard />

      <WeeklyAdherenceStrip />

      {!loading && !error && missedCount > 0 ? (
        <View
          style={[
            styles.missedAlert,
            {
              backgroundColor: theme.dangerLight,
              borderColor: theme.danger,
            },
          ]}
        >
          <View
            style={[
              styles.missedAlertIcon,
              { backgroundColor: theme.background },
            ]}
          >
            <Ionicons
              name="alert-circle-outline"
              size={22}
              color={theme.danger}
            />
          </View>

          <View style={styles.missedAlertContent}>
            <Text
              style={[
                styles.missedAlertTitle,
                { color: theme.danger },
              ]}
            >
              {missedCount === 1
                ? '1 missed dose today'
                : `${missedCount} missed doses today`}
            </Text>

            <Text
              style={[
                styles.missedAlertText,
                { color: theme.textSecondary },
              ]}
            >
              Review your schedule below.
            </Text>
          </View>

          <View
            style={[
              styles.missedCountBadge,
              { backgroundColor: theme.danger },
            ]}
          >
            <Text
              style={[
                styles.missedCountText,
                { color: theme.onPrimary },
              ]}
            >
              {missedCount}
            </Text>
          </View>
        </View>
      ) : null}

      <Text
        style={[
          styles.sectionTitle,
          { color: theme.textSecondary },
        ]}
      >
        TODAY&apos;S SCHEDULE
      </Text>
    </>
  );

  if (loading || error || sections.length === 0) {
    return (
      <SafeAreaView
        edges={['top']}
        style={[
          styles.safeArea,
          { backgroundColor: theme.backgroundElement },
        ]}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void loadDoses(true);
              }}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
        >
          {headerContent}

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator
                size="large"
                color={theme.primary}
              />

              <Text
                style={[
                  styles.stateText,
                  { color: theme.textSecondary },
                ]}
              >
                Loading today&apos;s schedule...
              </Text>
            </View>
          ) : error ? (
            <View
              style={[
                styles.stateCard,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.dangerLight,
                },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={28}
                color={theme.danger}
              />

              <Text
                style={[
                  styles.stateTitle,
                  { color: theme.text },
                ]}
              >
                Couldn&apos;t load schedule
              </Text>

              <Text
                style={[
                  styles.stateText,
                  { color: theme.textSecondary },
                ]}
              >
                {error}
              </Text>

              <TouchableOpacity
                activeOpacity={0.8}
                style={[
                  styles.retryButton,
                  { backgroundColor: theme.primary },
                ]}
                onPress={() => {
                  void loadDoses();
                }}
              >
                <Text
                  style={[
                    styles.retryText,
                    { color: theme.onPrimary },
                  ]}
                >
                  Try Again
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View
              style={[
                styles.stateCard,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.backgroundSelected,
                },
              ]}
            >
              <View
                style={[
                  styles.emptyIcon,
                  { backgroundColor: theme.accentMintBg },
                ]}
              >
                <Ionicons
                  name="calendar-outline"
                  size={24}
                  color={theme.primary}
                />
              </View>

              <Text
                style={[
                  styles.stateTitle,
                  { color: theme.text },
                ]}
              >
                No doses scheduled
              </Text>

              <Text
                style={[
                  styles.stateText,
                  { color: theme.textSecondary },
                ]}
              >
                You don&apos;t have any medication doses
                scheduled for today.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[
        styles.safeArea,
        { backgroundColor: theme.backgroundElement },
      ]}
    >
      <SectionList
        ref={sectionListRef}
        onContentSizeChange={handleContentReady}
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadDoses(true);
            }}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
        sections={sections}
        keyExtractor={(item) => String(item.scheduleTimeId)}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={<>{headerContent}</>}
        renderSectionHeader={({ section }) => (
          <View style={styles.groupHeader}>
            <Ionicons
              name={SECTION_ICON[section.key]}
              size={14}
              color={theme.textSecondary}
            />

            <Text
              style={[
                styles.periodText,
                { color: theme.textSecondary },
              ]}
            >
              {section.title.toUpperCase()}
            </Text>

            <Text
              style={[
                styles.timeText,
                { color: theme.textSecondary },
              ]}
            >
              · {section.data.length}
            </Text>
          </View>
        )}
        renderSectionFooter={() => (
          <View style={{ height: Spacing.three }} />
        )}
        renderItem={({ item: dose }) => (
          <TodayDoseCard
            dose={dose}
            isUpdating={updatingId === dose.scheduleTimeId}
            isHighlighted={
              targetScheduleTimeId !== null &&
              dose.scheduleTimeId === targetScheduleTimeId
            }
            onMarkTaken={() =>
              void handleDoseAction(
                dose.scheduleTimeId,
                markDoseTaken,
                'taken',
              )
            }
            onMarkSkip={() =>
              void handleDoseAction(
                dose.scheduleTimeId,
                markDoseSkipped,
                'skipped',
              )
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  scrollView: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 124,
  },

  missedAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    marginBottom: 18,
    gap: 10,
    shadowColor: '#173E2A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },

  missedAlertIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  missedAlertContent: {
    flex: 1,
  },

  missedAlertTitle: {
    fontSize: 14,
    fontWeight: '700',
  },

  missedAlertText: {
    fontSize: 12,
    marginTop: 2,
  },

  missedCountBadge: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  missedCountText: {
    fontSize: 13,
    fontWeight: '700',
  },

  sectionTitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 4,
    marginBottom: 14,
  },

  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 2,
    gap: 5,
  },

  periodText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },

  timeText: {
  fontSize: 12,
  lineHeight: 16,
  fontWeight: '400',
  opacity: 0.55,
},

  centerState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },

  stateCard: {
    minHeight: 210,
    borderWidth: 1,
    borderRadius: 24,
    padding: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#173E2A',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },

  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },

  stateTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: Spacing.two,
  },

  stateText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: Spacing.two,
  },

  retryButton: {
    borderRadius: 18,
    paddingHorizontal: Spacing.four,
    paddingVertical: 10,
    marginTop: Spacing.three,
  },

  retryText: {
    fontSize: 13,
    fontWeight: '700',
  },

  header: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: 18,
},

headerText: {
  flex: 1,
},

greeting: {
  fontSize: 13,
  lineHeight: 18,
  fontWeight: '600',
},

welcome: {
  fontSize: 26,
  lineHeight: 32,
  fontWeight: '800',
  letterSpacing: -0.4,
  marginTop: 2,
},

date: {
  fontSize: 12,
  lineHeight: 17,
  marginTop: 4,
},
});
