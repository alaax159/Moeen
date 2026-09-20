import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "react-native-qrcode-svg";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import {
  EMERGENCY_CARD_GENERIC_ERROR,
  EMERGENCY_ACCESS_CONFLICT_ERROR,
  EMERGENCY_ACCESS_GENERIC_ERROR,
  EmergencySupportApiError,
  disableEmergencyAccess,
  enableEmergencyAccess,
  getEmergencyAccess,
  getEmergencyMedicalCard,
  isEmergencyAccessConflict,
  regenerateEmergencyAccess,
} from "@/features/emergency-support/api";
import { EmergencyAccessStatusCoordinator } from "@/features/emergency-support/access-status-coordinator";
import {
  clearEmergencyLockscreenQr,
  isEmergencyLockscreenEnabled,
  publishEmergencyLockscreenQrWithRollback,
  setEmergencyLockscreenEnabled,
} from "@/features/emergency-support/android-lockscreen";
import { buildEmergencyQrPayload } from "@/features/emergency-support/qr-payload";
import {
  clearEmergencyAccessCredential,
  loadEmergencyAccessCredential,
  saveEmergencyAccessCredential,
} from "@/features/emergency-support/credential-store";
import type {
  EmergencyAccessStatus,
  EmergencyCardMedication,
  EmergencyMedicalCard,
} from "@/features/emergency-support/types";
import { FormScreenHeader } from "@/features/health-profile/FormScreenHeader";
import { formatFrequency, formatTime } from "@/features/medications/list/utils";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/features/notification-preferences/api";
import { useTheme } from "@/hooks/use-theme";

function formatDate(value: string | null): string {
  if (!value) return "Not on file";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not on file";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatUpdated(value: string | null): string {
  if (!value) return "Update date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Update date unavailable";
  return `Last updated ${date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })}`;
}

function medicationName(medication: EmergencyCardMedication): string {
  return (
    medication.name ??
    medication.normalizedName ??
    "Medication name unavailable"
  );
}

function canRegenerate(access: EmergencyAccessStatus | null): boolean {
  return !!access?.enabled;
}

export default function EmergencySupportScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  // Scalar owner id for the lock-screen opt-in, which is scoped per account.
  const ownerUid = user?.uid ?? null;
  const [card, setCard] = useState<EmergencyMedicalCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<EmergencyAccessStatus | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [lockscreenEnabled, setLockscreenEnabled] = useState(false);
  const [lockscreenBusy, setLockscreenBusy] = useState(false);
  const [lockscreenError, setLockscreenError] = useState<string | null>(null);
  // Opt-in for texting the emergency contact on a severe medication event.
  // null = not loaded yet / load failed; boolean = known server state.
  const [smsEnabled, setSmsEnabled] = useState<boolean | null>(null);
  const [smsLoading, setSmsLoading] = useState(true);
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);
  const smsPreferenceRequestId = useRef(0);
  const smsMutationInFlight = useRef(false);
  const qrRef = useRef<{
    toDataURL(callback: (data: string) => void): void;
  } | null>(null);
  const lockscreenGeneration = useRef(0);
  const [mutation, setMutation] = useState<
    "enable" | "regenerate" | "disable" | null
  >(null);
  const accessStatusCoordinator = useRef(
    new EmergencyAccessStatusCoordinator(),
  ).current;

  const loadCard = useCallback(async (refresh = false) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      setCard(await getEmergencyMedicalCard());
    } catch (err) {
      setError(
        err instanceof EmergencySupportApiError
          ? err.message
          : EMERGENCY_CARD_GENERIC_ERROR,
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const applyAccessStatus = useCallback(
    async (status: EmergencyAccessStatus, requestId: number) => {
      const result = await accessStatusCoordinator.reconcileStatus(
        requestId,
        status,
        user?.uid ?? null,
        loadEmergencyAccessCredential,
        clearEmergencyAccessCredential,
      );
      if (result.kind === "ignored") return false;

      setAccess(status);
      setRawToken(result.kind === "available" ? result.rawToken : null);
      return true;
    },
    [accessStatusCoordinator, user?.uid],
  );

  const loadAccess = useCallback(async () => {
    const requestId = accessStatusCoordinator.beginStatusRequest();
    setAccessLoading(true);
    setAccessError(null);
    setRawToken(null);
    try {
      await applyAccessStatus(await getEmergencyAccess(), requestId);
    } catch (err) {
      if (!accessStatusCoordinator.isLatest(requestId)) return;
      setAccessError(
        err instanceof EmergencySupportApiError
          ? err.message
          : EMERGENCY_ACCESS_GENERIC_ERROR,
      );
    } finally {
      if (accessStatusCoordinator.isLatest(requestId)) {
        setAccessLoading(false);
      }
    }
  }, [accessStatusCoordinator, applyAccessStatus]);

  const loadSmsPreference = useCallback(async () => {
    if (smsMutationInFlight.current) return;

    const requestId = ++smsPreferenceRequestId.current;

    setSmsLoading(true);
    setSmsError(null);

    try {
      const prefs = await getNotificationPreferences();

      if (
        requestId !== smsPreferenceRequestId.current ||
        smsMutationInFlight.current
      ) {
        return;
      }

      setSmsEnabled(prefs.emergencyContactSmsEnabled);
    } catch {
      if (requestId !== smsPreferenceRequestId.current) return;

      setSmsEnabled(null);
      setSmsError(
        "Unable to load the emergency contact text setting. Pull down to refresh and try again.",
      );
    } finally {
      if (
        requestId === smsPreferenceRequestId.current &&
        !smsMutationInFlight.current
      ) {
        setSmsLoading(false);
      }
    }
  }, []);

  const handleSmsToggle = useCallback(async () => {
    if (smsBusy || smsEnabled === null || smsMutationInFlight.current) return;

    const next = !smsEnabled;

    smsMutationInFlight.current = true;
    smsPreferenceRequestId.current += 1;

    setSmsLoading(false);
    setSmsBusy(true);
    setSmsError(null);
    setSmsEnabled(next);

    try {
      await updateNotificationPreferences({
        emergencyContactSmsEnabled: next,
      });
    } catch (err) {
      setSmsEnabled(!next);
      setSmsError(
        err instanceof Error
          ? err.message
          : "Couldn't update the emergency contact text setting. Try again.",
      );
    } finally {
      smsMutationInFlight.current = false;
      setSmsBusy(false);
    }
  }, [smsBusy, smsEnabled]);

  const refreshAfterConflict = useCallback(async () => {
    setRawToken(null);
    try {
      await accessStatusCoordinator.runCredentialOperation(
        clearEmergencyAccessCredential,
      );
    } catch {
      // Never restore a credential after a version conflict.
    }
    const requestId = accessStatusCoordinator.beginStatusRequest();
    try {
      const status = await getEmergencyAccess();
      if (!(await applyAccessStatus(status, requestId))) return;
      setAccessError(EMERGENCY_ACCESS_CONFLICT_ERROR);
    } catch {
      if (!accessStatusCoordinator.isLatest(requestId)) return;
      setAccessError(
        "Emergency Access changed, but its latest status could not be loaded. Try again.",
      );
    }
  }, [accessStatusCoordinator, applyAccessStatus]);

  const refreshAfterAmbiguousMutation = useCallback(async () => {
    setRawToken(null);
    try {
      await accessStatusCoordinator.runCredentialOperation(
        clearEmergencyAccessCredential,
      );
    } catch {
      // The UI remains cleared even if native secure storage is unavailable.
    }

    const requestId = accessStatusCoordinator.beginStatusRequest();
    try {
      if (!(await applyAccessStatus(await getEmergencyAccess(), requestId))) {
        return;
      }
      setAccessError(
        "The request result was uncertain. The latest Emergency Access status has been loaded; review it before trying again.",
      );
    } catch {
      if (!accessStatusCoordinator.isLatest(requestId)) return;
      setAccessError(
        "The request result was uncertain and the latest status could not be loaded. Try refreshing before making another change.",
      );
    }
  }, [accessStatusCoordinator, applyAccessStatus]);

  const handleMutationError = useCallback(
    async (err: unknown, ambiguousMutation = false) => {
      if (isEmergencyAccessConflict(err)) {
        await refreshAfterConflict();
        return;
      }
      if (ambiguousMutation) {
        await refreshAfterAmbiguousMutation();
        return;
      }
      setAccessError(
        err instanceof EmergencySupportApiError
          ? err.message
          : EMERGENCY_ACCESS_GENERIC_ERROR,
      );
    },
    [refreshAfterAmbiguousMutation, refreshAfterConflict],
  );

  const persistReturnedToken = useCallback(
    async (rawTokenToStore: string, version: number) => {
      if (!user) {
        throw new Error("Authenticated user is unavailable");
      }
      await accessStatusCoordinator.runCredentialOperation(() =>
        saveEmergencyAccessCredential({
          ownerUid: user.uid,
          rawToken: rawTokenToStore,
          version,
        }),
      );
      setRawToken(rawTokenToStore);
    },
    [accessStatusCoordinator, user],
  );

  const recoverAfterCredentialPersistenceFailure = useCallback(async () => {
    setRawToken(null);
    try {
      await accessStatusCoordinator.runCredentialOperation(
        clearEmergencyAccessCredential,
      );
    } catch {
      // The QR stays hidden even if native secure storage cannot be cleared.
    }

    const requestId = accessStatusCoordinator.beginStatusRequest();
    try {
      const status = await getEmergencyAccess();
      if (!(await applyAccessStatus(status, requestId))) return;
      setAccessError(
        status.enabled
          ? "Emergency Access is enabled, but the QR credential could not be stored. Regenerate QR to create and save a new QR."
          : "The QR credential could not be stored. The latest Emergency Access status has been loaded.",
      );
    } catch {
      if (!accessStatusCoordinator.isLatest(requestId)) return;
      setAccessError(
        "Emergency Access was updated, but the QR credential could not be stored and the latest status could not be loaded. Refresh before making another change.",
      );
    }
  }, [accessStatusCoordinator, applyAccessStatus]);

  const handleEnable = useCallback(async () => {
    if (!access || mutation) return;
    setMutation("enable");
    accessStatusCoordinator.invalidateStatusRequests();
    setAccessLoading(false);
    setAccessError(null);
    setRawToken(null);
    try {
      const result = await enableEmergencyAccess(
        access.configured ? access.version : undefined,
      );
      setAccess({
        enabled: result.enabled,
        configured: true,
        version: result.version,
        updatedAt: result.updatedAt,
      });
      if (result.tokenGenerated && result.token) {
        try {
          await persistReturnedToken(result.token, result.version);
        } catch {
          await recoverAfterCredentialPersistenceFailure();
        }
      } else {
        setRawToken(null);
      }
    } catch (err) {
      await handleMutationError(err, true);
    } finally {
      setMutation(null);
    }
  }, [
    access,
    accessStatusCoordinator,
    handleMutationError,
    mutation,
    persistReturnedToken,
    recoverAfterCredentialPersistenceFailure,
  ]);

  const handleRegenerate = useCallback(async () => {
    if (!access || mutation) return;
    // Defensive layer independent of the render gate: if a future change ever makes Regenerate reachable while disabled, don't call the API and hit an avoidable 409.
    if (!canRegenerate(access)) return;
    setMutation("regenerate");
    accessStatusCoordinator.invalidateStatusRequests();
    setAccessLoading(false);
    setAccessError(null);
    setRawToken(null);
    try {
      const result = await regenerateEmergencyAccess(access.version);
      setAccess({
        enabled: true,
        configured: true,
        version: result.version,
        updatedAt: result.updatedAt,
      });
      try {
        await persistReturnedToken(result.token, result.version);
      } catch {
        await recoverAfterCredentialPersistenceFailure();
      }
    } catch (err) {
      await handleMutationError(err, true);
    } finally {
      setMutation(null);
    }
  }, [
    access,
    accessStatusCoordinator,
    handleMutationError,
    mutation,
    persistReturnedToken,
    recoverAfterCredentialPersistenceFailure,
  ]);

  const handleDisable = useCallback(async () => {
    if (!access || mutation) return;
    setMutation("disable");
    accessStatusCoordinator.invalidateStatusRequests();
    setAccessLoading(false);
    setAccessError(null);
    try {
      const result = await disableEmergencyAccess(access.version);
      setRawToken(null);
      await accessStatusCoordinator.runCredentialOperation(
        clearEmergencyAccessCredential,
      );
      setAccess(result);
    } catch (err) {
      await handleMutationError(err, true);
    } finally {
      setMutation(null);
    }
  }, [access, accessStatusCoordinator, handleMutationError, mutation]);

  const confirmRegenerate = useCallback(() => {
    if (mutation) return;
    Alert.alert(
      "Regenerate emergency QR?",
      "All existing copies of this QR—including screenshots, saved or shared copies, printouts, and widgets—will stop working immediately.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          style: "destructive",
          onPress: () => void handleRegenerate(),
        },
      ],
    );
  }, [handleRegenerate, mutation]);

  const confirmDisable = useCallback(() => {
    if (mutation) return;
    Alert.alert(
      "Disable Emergency Access?",
      "The current QR will stop working immediately. You can enable access again later with a new QR.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disable",
          style: "destructive",
          onPress: () => void handleDisable(),
        },
      ],
    );
  }, [handleDisable, mutation]);

  useFocusEffect(
    useCallback(() => {
      let focused = true;
      void loadCard();
      void loadAccess();
      void loadSmsPreference();
      void isEmergencyLockscreenEnabled(ownerUid)
        .then((enabled) => {
          if (focused) setLockscreenEnabled(enabled);
        })
        .catch(() => {
          if (!focused) return;
          setLockscreenEnabled(false);
          setLockscreenError(
            "Lock-screen access could not be checked. Please restart or update the app and try again.",
          );
        });
      return () => {
        focused = false;
      };
    }, [loadAccess, loadCard, loadSmsPreference, ownerUid]),
  );

  const qrPayload = rawToken ? buildEmergencyQrPayload(rawToken) : null;

  const publishLockscreenQr = useCallback(async () => {
    if (!lockscreenEnabled || !access?.enabled || !qrPayload || !qrRef.current)
      return;
    const generation = ++lockscreenGeneration.current;
    const encodedPng = await new Promise<string>((resolve) => {
      qrRef.current?.toDataURL(resolve);
    });
    if (generation !== lockscreenGeneration.current) return;
    const published = await publishEmergencyLockscreenQrWithRollback(
      ownerUid,
      encodedPng,
      () => generation === lockscreenGeneration.current,
    );
    if (!published && generation === lockscreenGeneration.current) {
      // The QR never reached the lock screen and the opt-in has been rolled
      // back, so the toggle has to follow it back to "Disabled".
      lockscreenGeneration.current += 1;
      setLockscreenEnabled(false);
      setLockscreenError(
        "Unable to show the Emergency QR on the lock screen. Please make sure notifications are enabled for Moeen.",
      );
    }
  }, [access?.enabled, lockscreenEnabled, qrPayload, ownerUid]);

  useEffect(() => {
    if (accessLoading || mutation || !lockscreenEnabled) return;
    if (!access?.enabled || !qrPayload) {
      lockscreenGeneration.current += 1;
      void clearEmergencyLockscreenQr().catch(() => {
        setLockscreenError(
          "The lock-screen Emergency QR could not be removed.",
        );
      });
      return;
    }
    void publishLockscreenQr().catch(() => {
      setLockscreenError("The lock-screen Emergency QR could not be updated.");
    });
  }, [
    access?.enabled,
    accessLoading,
    lockscreenEnabled,
    mutation,
    publishLockscreenQr,
    qrPayload,
  ]);

  const handleLockscreenToggle = useCallback(async () => {
    if (lockscreenBusy) return;
    setLockscreenBusy(true);
    setLockscreenError(null);
    try {
      if (lockscreenEnabled) {
        lockscreenGeneration.current += 1;
        await setEmergencyLockscreenEnabled(ownerUid, false);
        setLockscreenEnabled(false);
        return;
      }

      const permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== "granted") {
        setLockscreenError(
          "Allow notifications in Android settings to use lock-screen Emergency Access.",
        );
        return;
      }
      await setEmergencyLockscreenEnabled(ownerUid, true);
      setLockscreenEnabled(true);
    } catch {
      setLockscreenError("Lock-screen Emergency Access could not be updated.");
    } finally {
      setLockscreenBusy(false);
    }
  }, [lockscreenBusy, lockscreenEnabled, ownerUid]);

  const patientName = card
    ? [card.patient.firstName, card.patient.lastName].filter(Boolean).join(" ")
    : "";

  return (
    <ThemedView
      style={[styles.screen, { backgroundColor: theme.backgroundElement }]}
    >
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void Promise.all([
                  loadCard(true),
                  loadAccess(),
                  loadSmsPreference(),
                ]);
              }}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
        >
          <FormScreenHeader title="Emergency Medical Card" />

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                Loading your card...
              </Text>
            </View>
          ) : error ? (
            <View
              style={[styles.stateCard, { backgroundColor: theme.background }]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={30}
                color={theme.danger}
              />
              <Text style={[styles.stateTitle, { color: theme.text }]}>
                Couldn&apos;t load your card
              </Text>
              <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                {error}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void loadCard()}
                style={[styles.retryButton, { backgroundColor: theme.primary }]}
              >
                <Text style={[styles.retryText, { color: theme.onPrimary }]}>
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : card ? (
            <>
              <View
                style={[styles.hero, { backgroundColor: theme.dangerLight }]}
              >
                <Ionicons name="medical" size={28} color={theme.danger} />
                <View style={styles.heroText}>
                  <Text style={[styles.patientName, { color: theme.text }]}>
                    {patientName || "Name not on file"}
                  </Text>
                  <Text
                    style={[styles.updated, { color: theme.textSecondary }]}
                  >
                    {formatUpdated(card.lastUpdated)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.bloodBadge,
                    { backgroundColor: theme.background },
                  ]}
                >
                  <Text
                    style={[styles.bloodLabel, { color: theme.textSecondary }]}
                  >
                    BLOOD
                  </Text>
                  <Text style={[styles.bloodType, { color: theme.danger }]}>
                    {card.patient.bloodType ?? "—"}
                  </Text>
                </View>
              </View>

              <Card title="Patient details">
                <DetailRow
                  label="Date of birth"
                  value={formatDate(card.patient.dateOfBirth)}
                />
                <DetailRow
                  label="Gender"
                  value={
                    card.patient.gender
                      ? `${card.patient.gender[0].toUpperCase()}${card.patient.gender.slice(1)}`
                      : "Not on file"
                  }
                />
              </Card>

              <Card title="Allergies" count={card.allergies.length}>
                {card.allergies.length === 0 ? (
                  <EmptyText text="Allergy information is not available." />
                ) : (
                  card.allergies.map((allergy, index) => (
                    <Item key={`${allergy.name}-${index}`} title={allergy.name}>
                      {[allergy.severity, allergy.reaction]
                        .filter(Boolean)
                        .join(" · ") || "Details not on file"}
                    </Item>
                  ))
                )}
              </Card>

              <Card
                title="Chronic conditions"
                count={card.chronicConditions.length}
              >
                {card.chronicConditions.length === 0 ? (
                  <EmptyText text="Chronic condition information is not available." />
                ) : (
                  card.chronicConditions.map((condition, index) => (
                    <Item
                      key={`${condition.name}-${index}`}
                      title={condition.name}
                    />
                  ))
                )}
              </Card>

              <Card title="Current medications" count={card.medications.length}>
                {card.medications.length === 0 ? (
                  <EmptyText text="No current medications on file." />
                ) : (
                  card.medications.map((medication, index) => {
                    const details = `${medication.dose} ${medication.unit} ${medication.dosageForm} · ${formatFrequency(medication.frequency)}`;
                    const schedule =
                      medication.times.length > 0
                        ? medication.times.map(formatTime).join(", ")
                        : "Times not on file";
                    return (
                      <Item
                        key={`${medicationName(medication)}-${index}`}
                        title={medicationName(medication)}
                      >
                        {[details, schedule, medication.instructions]
                          .filter(Boolean)
                          .join("\n")}
                      </Item>
                    );
                  })
                )}
              </Card>

              <Card
                title="Emergency contacts"
                count={card.emergencyContacts.length}
              >
                {card.emergencyContacts.length === 0 ? (
                  <EmptyText text="No emergency contacts on file." />
                ) : (
                  card.emergencyContacts.map((contact, index) => (
                    <Item
                      key={`${contact.phone}-${index}`}
                      title={contact.name ?? "Emergency contact"}
                    >
                      {contact.phone}
                    </Item>
                  ))
                )}
              </Card>
            </>
          ) : null}

          <EmergencyAccessCard
            access={access}
            error={accessError}
            loading={accessLoading}
            mutation={mutation}
            rawToken={rawToken}
            lockscreenBusy={lockscreenBusy}
            lockscreenEnabled={lockscreenEnabled}
            lockscreenError={lockscreenError}
            onLockscreenToggle={() => void handleLockscreenToggle()}
            onQrRef={(instance) => {
              qrRef.current = instance;
            }}
            onDisable={confirmDisable}
            onEnable={() => void handleEnable()}
            onRegenerate={confirmRegenerate}
            onRetry={() => void loadAccess()}
          />

          <EmergencyContactAlertsCard
            enabled={smsEnabled}
            loading={smsLoading}
            busy={smsBusy}
            error={smsError}
            onToggle={() => void handleSmsToggle()}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

interface EmergencyContactAlertsCardProps {
  enabled: boolean | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  onToggle: () => void;
}

/**
 * Opt-in for texting the patient's emergency contact when a severe medication
 * issue is detected (default-on server-side). The one-line explanation stays
 * visible in every state — this is default-on, so ongoing disclosure matters
 * more than a single dismissible moment.
 */
function EmergencyContactAlertsCard({
  enabled,
  loading,
  busy,
  error,
  onToggle,
}: EmergencyContactAlertsCardProps) {
  const theme = useTheme();
  const statusColor = enabled ? theme.success : theme.textSecondary;

  return (
    <View style={[styles.accessCard, { backgroundColor: theme.background }]}>
      <View style={styles.cardHeader}>
        <View style={styles.accessTitleRow}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={21}
            color={theme.primary}
          />
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            Emergency contact alerts
          </Text>
        </View>
        {!loading && enabled !== null ? (
          <View style={[styles.statusBadge, { borderColor: statusColor }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {enabled ? "On" : "Off"}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.accessMessage, { color: theme.textSecondary }]}>
        We&apos;ll text your emergency contact if a severe medication issue is
        detected.
      </Text>

      {loading ? (
        <View style={styles.accessLoading}>
          <ActivityIndicator color={theme.primary} />
          <Text style={[styles.accessMessage, { color: theme.textSecondary }]}>
            Loading this setting...
          </Text>
        </View>
      ) : enabled === null ? (
        <Text style={[styles.accessMessage, { color: theme.textSecondary }]}>
          {error ?? "This setting is unavailable right now."}
        </Text>
      ) : (
        <>
          {error ? (
            <View
              style={[
                styles.inlineError,
                { backgroundColor: theme.dangerLight },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={theme.danger}
              />
              <Text style={[styles.inlineErrorText, { color: theme.danger }]}>
                {error}
              </Text>
            </View>
          ) : null}
          <ActionButton
            busy={busy}
            disabled={busy}
            label={enabled ? "Turn off contact texts" : "Turn on contact texts"}
            onPress={onToggle}
          />
        </>
      )}
    </View>
  );
}

interface EmergencyAccessCardProps {
  access: EmergencyAccessStatus | null;
  error: string | null;
  loading: boolean;
  mutation: "enable" | "regenerate" | "disable" | null;
  rawToken: string | null;
  lockscreenBusy: boolean;
  lockscreenEnabled: boolean;
  lockscreenError: string | null;
  onDisable: () => void;
  onEnable: () => void;
  onRegenerate: () => void;
  onRetry: () => void;
  onLockscreenToggle: () => void;
  onQrRef: (
    instance: { toDataURL(callback: (data: string) => void): void } | null,
  ) => void;
}

function EmergencyAccessCard({
  access,
  error,
  loading,
  mutation,
  rawToken,
  lockscreenBusy,
  lockscreenEnabled,
  lockscreenError,
  onDisable,
  onEnable,
  onRegenerate,
  onRetry,
  onLockscreenToggle,
  onQrRef,
}: EmergencyAccessCardProps) {
  const theme = useTheme();
  const busy = mutation !== null;
  const statusLabel = !access?.configured
    ? "Not configured"
    : access.enabled
      ? "Enabled"
      : "Disabled";
  const statusColor = access?.enabled ? theme.success : theme.textSecondary;
  const qrPayload = rawToken ? buildEmergencyQrPayload(rawToken) : null;

  return (
    <View style={[styles.accessCard, { backgroundColor: theme.background }]}>
      <View style={styles.cardHeader}>
        <View style={styles.accessTitleRow}>
          <Ionicons name="qr-code-outline" size={21} color={theme.primary} />
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            Emergency Access
          </Text>
        </View>
        {!loading && access ? (
          <View style={[styles.statusBadge, { borderColor: statusColor }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.accessLoading}>
          <ActivityIndicator color={theme.primary} />
          <Text style={[styles.accessMessage, { color: theme.textSecondary }]}>
            {access
              ? "Revalidating Emergency Access..."
              : "Loading Emergency Access..."}
          </Text>
        </View>
      ) : access ? (
        <>
          {access.enabled && qrPayload ? (
            <View style={styles.qrSection}>
              <View style={styles.qrSurface}>
                <QRCode
                  getRef={onQrRef}
                  value={qrPayload}
                  size={210}
                  backgroundColor="#FFFFFF"
                  color="#000000"
                />
              </View>
              <Text style={[styles.qrTitle, { color: theme.text }]}>
                Emergency QR prepared
              </Text>
              <Text
                style={[styles.accessMessage, { color: theme.textSecondary }]}
              >
                Scan this QR to open the read-only Emergency Medical Card.
              </Text>
            </View>
          ) : access.enabled && rawToken ? (
            <Text
              style={[styles.accessMessage, { color: theme.textSecondary }]}
            >
              Emergency QR is unavailable because the responder web address is
              not configured safely.
            </Text>
          ) : access.enabled ? (
            <Text
              style={[styles.accessMessage, { color: theme.textSecondary }]}
            >
              Access is enabled, but the existing secure token cannot be
              recovered. Regenerate to display a new QR; the previous QR will
              stop working.
            </Text>
          ) : access.configured ? (
            <Text
              style={[styles.accessMessage, { color: theme.textSecondary }]}
            >
              Emergency Access is disabled. Re-enabling creates a completely new
              QR.
            </Text>
          ) : (
            <Text
              style={[styles.accessMessage, { color: theme.textSecondary }]}
            >
              Enable secure Emergency Access to prepare your emergency QR.
            </Text>
          )}

          {Platform.OS === "android" ? (
            <LockscreenSetupSection
              busy={lockscreenBusy}
              disabled={busy}
              enabled={lockscreenEnabled}
              error={lockscreenError}
              onToggle={onLockscreenToggle}
              ready={access.enabled && !!qrPayload}
              setupBlocked={!access.enabled}
            />
          ) : null}

          <Text style={[styles.versionText, { color: theme.textSecondary }]}>
            Version {access.version} · {formatUpdated(access.updatedAt)}
          </Text>

          {error ? (
            <View
              style={[
                styles.inlineError,
                { backgroundColor: theme.dangerLight },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={theme.danger}
              />
              <Text style={[styles.inlineErrorText, { color: theme.danger }]}>
                {error}
              </Text>
            </View>
          ) : null}

          {!canRegenerate(access) ? (
            <ActionButton
              busy={mutation === "enable"}
              disabled={busy}
              label={
                access.configured
                  ? "Re-enable Emergency Access"
                  : "Enable Emergency Access"
              }
              onPress={onEnable}
            />
          ) : (
            <View style={styles.accessActions}>
              <ActionButton
                busy={mutation === "regenerate"}
                disabled={busy}
                label="Regenerate QR"
                onPress={onRegenerate}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={onDisable}
                style={[
                  styles.secondaryButton,
                  { borderColor: theme.danger, opacity: busy ? 0.55 : 1 },
                ]}
              >
                {mutation === "disable" ? (
                  <ActivityIndicator size="small" color={theme.danger} />
                ) : null}
                <Text
                  style={[styles.secondaryButtonText, { color: theme.danger }]}
                >
                  Disable Emergency Access
                </Text>
              </Pressable>
            </View>
          )}
        </>
      ) : (
        <>
          <Text style={[styles.accessMessage, { color: theme.textSecondary }]}>
            {error ?? EMERGENCY_ACCESS_GENERIC_ERROR}
          </Text>
          <ActionButton disabled={false} label="Try again" onPress={onRetry} />
        </>
      )}
    </View>
  );
}

/**
 * Android-only setup section for showing the Emergency QR on the lock
 * screen (Task 2043), built on the native module Task 2042 already added.
 * Always visible on Android so the state (unavailable / disabled / enabled)
 * is clear, even before Emergency Access is ready.
 */
function LockscreenSetupSection({
  busy,
  disabled,
  enabled,
  error,
  onToggle,
  ready,
  setupBlocked,
}: {
  busy: boolean;
  disabled: boolean;
  enabled: boolean;
  error: string | null;
  onToggle: () => void;
  ready: boolean;
  setupBlocked: boolean;
}) {
  const theme = useTheme();
  const statusLabel = !ready ? "Unavailable" : enabled ? "Enabled" : "Disabled";
  const statusColor = ready && enabled ? theme.success : theme.textSecondary;

  return (
    <View
      style={[
        styles.lockscreenSection,
        { borderTopColor: theme.backgroundElement },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.accessTitleRow}>
          <Ionicons
            name="lock-closed-outline"
            size={18}
            color={theme.primary}
          />
          <Text style={[styles.qrTitle, { color: theme.text, marginTop: 0 }]}>
            Android lock screen
          </Text>
        </View>
        <View style={[styles.statusBadge, { borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      <Text style={[styles.accessMessage, { color: theme.textSecondary }]}>
        Enabling this places your Emergency QR on the Android lock screen so
        first responders can scan it without unlocking your phone. No medical
        information is shown on the lock screen — only the QR code.
      </Text>

      {setupBlocked ? (
        <Text style={[styles.accessMessage, { color: theme.textSecondary }]}>
          Enable Emergency Access above first.
        </Text>
      ) : !ready ? (
        <Text style={[styles.accessMessage, { color: theme.textSecondary }]}>
          The Emergency QR is unavailable right now, so the lock screen
          can&apos;t be set up. Resolve the Emergency QR issue shown above first.
        </Text>
      ) : null}

      {error ? (
        <Text style={[styles.inlineErrorText, { color: theme.danger }]}>
          {error}
        </Text>
      ) : null}

      {ready ? (
        <ActionButton
          busy={busy}
          disabled={busy || disabled}
          label={enabled ? "Remove from lock screen" : "Show on lock screen"}
          onPress={onToggle}
        />
      ) : null}
    </View>
  );
}

function ActionButton({
  busy = false,
  disabled,
  label,
  onPress,
}: {
  busy?: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.primaryButton,
        { backgroundColor: theme.primary, opacity: disabled ? 0.55 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={theme.onPrimary} /> : null}
      <Text style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Card({
  children,
  count,
  title,
}: {
  children: React.ReactNode;
  count?: number;
  title: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.background }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
        {count !== undefined && (
          <Text style={[styles.count, { color: theme.textSecondary }]}>
            {count}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.itemDetail, { color: theme.textSecondary }]}>
        {label}
      </Text>
      <Text style={[styles.detailValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

function EmptyText({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
      {text}
    </Text>
  );
}

function Item({
  children,
  title,
}: {
  children?: React.ReactNode;
  title: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.item, { borderTopColor: theme.backgroundElement }]}>
      <Text style={[styles.itemTitle, { color: theme.text }]}>{title}</Text>
      {children ? (
        <Text style={[styles.itemDetail, { color: theme.textSecondary }]}>
          {children}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 124 },
  centerState: {
    alignItems: "center",
    gap: Spacing.three,
    paddingTop: Spacing.six,
  },
  stateCard: {
    alignItems: "center",
    borderRadius: 22,
    gap: Spacing.two,
    padding: Spacing.four,
  },
  stateTitle: { fontSize: 18, fontWeight: "700" },
  stateText: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  retryButton: {
    borderRadius: 12,
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: 12,
  },
  retryText: { fontSize: 14, fontWeight: "700" },
  hero: {
    alignItems: "center",
    borderRadius: 22,
    flexDirection: "row",
    gap: 12,
    padding: 16,
    shadowColor: "#173E2A",
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  heroText: { flex: 1 },
  patientName: { fontSize: 20, lineHeight: 26, fontWeight: "800" },
  updated: { fontSize: 12, marginTop: 4 },
  bloodBadge: {
    alignItems: "center",
    borderRadius: 12,
    minWidth: 58,
    padding: Spacing.two,
  },
  bloodLabel: { fontSize: 9, fontWeight: "700" },
  bloodType: { fontSize: 18, fontWeight: "800" },
  card: {
    borderRadius: 20,
    marginTop: 14,
    padding: 16,
    shadowColor: "#173E2A",
    shadowOpacity: 0.03,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  count: { fontSize: 13, fontWeight: "600" },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: Spacing.two,
  },
  detailValue: { fontSize: 14, fontWeight: "600" },
  item: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
  },
  itemTitle: { fontSize: 14, fontWeight: "700" },
  itemDetail: { fontSize: 13, lineHeight: 19, marginTop: 2 },
  emptyText: { fontSize: 13, paddingTop: Spacing.two },
  accessCard: {
    borderRadius: 20,
    marginTop: 14,
    padding: 16,
    shadowColor: "#173E2A",
    shadowOpacity: 0.03,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  accessTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.two,
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  statusText: { fontSize: 12, fontWeight: "700" },
  accessLoading: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  accessMessage: { fontSize: 13, lineHeight: 19, paddingTop: Spacing.two },
  versionText: { fontSize: 11, marginTop: Spacing.two },
  qrSection: { alignItems: "center", paddingTop: Spacing.three },
  lockscreenSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
  },
  qrSurface: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 14 },
  qrTitle: { fontSize: 16, fontWeight: "700", marginTop: Spacing.three },
  inlineError: {
    alignItems: "flex-start",
    borderRadius: 12,
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.three,
    padding: Spacing.two,
  },
  inlineErrorText: { flex: 1, fontSize: 12, lineHeight: 18 },
  accessActions: { gap: Spacing.two },
  primaryButton: {
    alignItems: "center",
    borderRadius: 16,
    flexDirection: "row",
    gap: Spacing.two,
    justifyContent: "center",
    marginTop: Spacing.three,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
  },
  primaryButtonText: { fontSize: 15, fontWeight: "700" },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: Spacing.two,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: Spacing.three,
  },
  secondaryButtonText: { fontSize: 14, fontWeight: "700" },
});
