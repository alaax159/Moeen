import Ionicons from "@expo/vector-icons/Ionicons";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import {
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  archiveMedication,
  getMedicationDetails,
  MedicationDetailsApiError,
} from "@/features/medications/details/api";
import type {
  MedicationDetailsResponse,
  UserMedicationDetails,
} from "@/features/medications/details/types";
import { getActiveInteractions } from "@/features/medications/list/api";
import type { MedicationSafetyWarning } from "@/features/medications/list/types";
import { useTheme } from "@/hooks/use-theme";

function capitalize(value: string): string {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatFrequency(frequency: number): string {
  switch (frequency) {
    case 0:
      return "As needed";
    case 1:
      return "Once daily";
    case 2:
      return "Twice daily";
    case 3:
      return "Three times daily";
    case 4:
      return "Four times daily";
    default:
      return `${frequency} times daily`;
  }
}

function formatTime(value: string): string {
  const [hoursText, minutesText] = value.split(":");

  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes)
  ) {
    return value;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${String(minutes).padStart(
    2,
    "0",
  )} ${period}`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Not specified";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getDurationLabel(
  userMedication: UserMedicationDetails,
): string {
  if (userMedication.endDate) {
    return `Until ${formatDate(
      userMedication.endDate,
    )}`;
  }

  return capitalize(userMedication.completion);
}

export default function MedicationDetailsScreen() {
  const theme = useTheme();

  const params = useLocalSearchParams<{
    id?: string;
  }>();

  const rawId =
    typeof params.id === "string"
      ? params.id
      : "";

  const parsedId = Number(rawId);

  const userMedicationId =
    Number.isInteger(parsedId) && parsedId > 0
      ? parsedId
      : null;

  const [details, setDetails] =
    useState<MedicationDetailsResponse | null>(
      null,
    );

  const [isLoading, setIsLoading] =
    useState(true);

  const [isArchiving, setIsArchiving] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const [warnings, setWarnings] = useState<
    MedicationSafetyWarning[]
  >([]);

  const loadWarnings = useCallback(async () => {
    if (userMedicationId === null) return;

    let allWarnings: MedicationSafetyWarning[];
    try {
      allWarnings = await getActiveInteractions();
    } catch {
      // Keep the last-known warnings — a failed safety check must never
      // look the same as a confirmed empty result.
      return;
    }

    setWarnings(
      allWarnings.filter(
        (warning) => warning.userMedicationId === userMedicationId,
      ),
    );
  }, [userMedicationId]);

  const loadDetails = useCallback(async () => {
    if (userMedicationId === null) {
      setErrorMessage(
        "The medication record ID is invalid.",
      );
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);

      const response =
        await getMedicationDetails(
          userMedicationId,
        );

      if (response.userMedications.length === 0) {
        setErrorMessage(
          "No medication record was found.",
        );
        setDetails(null);
        return;
      }

      setDetails(response);
    } catch (error) {
      const message =
        error instanceof MedicationDetailsApiError
          ? error.message
          : "Could not load medication details.";

      setErrorMessage(message);
      setDetails(null);
    } finally {
      setIsLoading(false);
    }
  }, [userMedicationId]);

  useFocusEffect(
  useCallback(() => {
    void loadDetails();
    void loadWarnings();
  }, [loadDetails, loadWarnings]),
);

  const userMedication =
   details?.userMedications.find(
     (item) => item.id === userMedicationId,
  ) ?? null;

  const medicationName = useMemo(() => {
    if (!details) {
      return "";
    }

    return (
      details.medication.brandName ||
      details.medication.genericName ||
      "Medication"
    );
  }, [details]);

  const scheduleLabel = useMemo(() => {
    if (!userMedication) {
      return "";
    }

    if (
      userMedication.scheduleTimes.length === 0
    ) {
      return "As needed";
    }

    return userMedication.scheduleTimes
      .map((item) => formatTime(item.time))
      .join(" & ");
  }, [userMedication]);

  function handleEdit() {
   if (!userMedication) {
     return;
    }

   router.push({
     pathname: "/medications/update",
     params: {
       id: String(userMedication.id),
     },
    });
  }

  function confirmArchive() {
    if (
      !userMedication ||
      userMedication.status === "archived" ||
      isArchiving
    ) {
      return;
    }

    Alert.alert(
      "Archive medication?",
      "This medication will move to your archived records.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Archive",
          style: "destructive",
          onPress: () => {
            void handleArchive();
          },
        },
      ],
    );
  }

  async function handleArchive() {
    if (!userMedication) {
      return;
    }

    try {
      setIsArchiving(true);

      await archiveMedication(
        userMedication.id,
      );

      Alert.alert(
        "Medication archived",
        "The medication was archived successfully.",
        [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ],
      );
    } catch (error) {
      const message =
        error instanceof MedicationDetailsApiError
          ? error.message
          : "Could not archive the medication.";

      Alert.alert(
        "Unable to archive medication",
        message,
      );
    } finally {
      setIsArchiving(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView
        edges={["top"]}
        style={[
          styles.screen,
          {
            backgroundColor:
              theme.backgroundElement,
          },
        ]}
      >
        <Header
          status={null}
          onBack={() => router.back()}
        />

        <View style={styles.centerState}>
          <ActivityIndicator
            size="large"
            color={theme.primary}
          />

          <Text
            style={[
              styles.stateText,
              {
                color: theme.textSecondary,
              },
            ]}
          >
            Loading medication details...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (
    errorMessage ||
    !details ||
    !userMedication
  ) {
    return (
      <SafeAreaView
        edges={["top"]}
        style={[
          styles.screen,
          {
            backgroundColor:
              theme.backgroundElement,
          },
        ]}
      >
        <Header
          status={null}
          onBack={() => router.back()}
        />

        <View style={styles.centerState}>
          <View
            style={[
              styles.stateIcon,
              {
                backgroundColor:
                  theme.dangerLight,
              },
            ]}
          >
            <Ionicons
              name="alert-circle-outline"
              size={28}
              color={theme.danger}
            />
          </View>

          <Text
            style={[
              styles.errorTitle,
              {
                color: theme.text,
              },
            ]}
          >
            Unable to load medication
          </Text>

          <Text
            style={[
              styles.stateText,
              {
                color: theme.textSecondary,
              },
            ]}
          >
            {errorMessage ??
              "Medication details are unavailable."}
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void loadDetails();
            }}
            style={[
              styles.retryButton,
              {
                backgroundColor:
                  theme.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.retryButtonText,
                {
                  color: theme.onPrimary,
                },
              ]}
            >
              Try Again
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isArchived =
    userMedication.status === "archived";

  return (
    <SafeAreaView
      edges={["top"]}
      style={[
        styles.screen,
        {
          backgroundColor:
            theme.backgroundElement,
        },
      ]}
    >
      <Header
        status={userMedication.status}
        onBack={() => router.back()}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View
          style={[
            styles.summaryCard,
            {
              backgroundColor:
                theme.background,
              borderColor:
                theme.backgroundSelected,
            },
          ]}
        >
          <View
            style={[
              styles.medicationIcon,
              {
                backgroundColor:
                  theme.primaryLight,
              },
            ]}
          >
            <Ionicons
              name="medical-outline"
              size={27}
              color={theme.primary}
            />
          </View>

          <View style={styles.summaryText}>
            <Text
              style={[
                styles.medicationName,
                {
                  color: theme.text,
                },
              ]}
            >
              {medicationName}
            </Text>

            <Text
              style={[
                styles.medicationSubtitle,
                {
                  color:
                    theme.textSecondary,
                },
              ]}
            >
              {userMedication.dosageAmount}{" "}
              {userMedication.dosageUnit}
              {" · "}
              {userMedication.dosageForm}
            </Text>

            {details.medication.genericName &&
              details.medication.genericName !==
                medicationName && (
                <Text
                  style={[
                    styles.genericName,
                    {
                      color:
                        theme.textSecondary,
                    },
                  ]}
                >
                  {
                    details.medication
                      .genericName
                  }
                </Text>
              )}

            {details.medication.verificationSource && (
              <View
                style={
                  styles.verifiedRow
                }
              >
                <Ionicons
                  name={
                    details.medication.verificationStatus === "verified"
                      ? "checkmark-circle"
                      : "alert-circle-outline"
                  }
                  size={16}
                  color={
                    details.medication.verificationStatus === "verified"
                      ? theme.success
                      : theme.textSecondary
                  }
                />

                <Text
                  style={[
                    styles.verifiedText,
                    {
                      color:
                        details.medication.verificationStatus === "verified"
                          ? theme.success
                          : theme.textSecondary,
                    },
                  ]}
                >
                  {details.medication.verificationStatus !== "verified"
                    ? "Unverified manual entry"
                    : details.medication.verificationSource === "palestine_moh"
                      ? "Palestinian MOH"
                      : details.medication.verificationSource === "dailymed"
                        ? "DailyMed"
                        : "RxNorm"}
                </Text>
              </View>
            )}
          </View>
        </View>

        {warnings.length > 0 && (
          <SafetyWarningsSection warnings={warnings} />
        )}

        <SectionTitle>
          PRESCRIPTION DETAILS
        </SectionTitle>

        <View
          style={[
            styles.detailsCard,
            {
              backgroundColor:
                theme.background,
              borderColor:
                theme.backgroundSelected,
            },
          ]}
        >
          <DetailRow
            label="Dose"
            value={`${userMedication.dosageAmount} ${userMedication.dosageUnit}`}
          />

          <DetailRow
            label="Dosage Form"
            value={
              userMedication.dosageForm
            }
          />

          <DetailRow
            label="Frequency"
            value={formatFrequency(
              userMedication.frequency,
            )}
          />

          <DetailRow
            label="Scheduled Times"
            value={scheduleLabel}
          />

          <DetailRow
            label="Duration"
            value={getDurationLabel(
              userMedication,
            )}
            hideBorder
          />
        </View>

        <SectionTitle>
          INSTRUCTIONS
        </SectionTitle>

        <View
          style={[
            styles.instructionsCard,
            {
              backgroundColor:
                theme.background,
              borderColor:
                theme.backgroundSelected,
            },
          ]}
        >
          <Text
            style={[
              styles.instructionsText,
              {
                color:
                  userMedication.instructions
                    ? theme.text
                    : theme.textSecondary,
              },
            ]}
          >
            {userMedication.instructions ||
              "No instructions were added."}
          </Text>
        </View>

        <SectionTitle>
          RECORD INFO
        </SectionTitle>

        <View
          style={[
            styles.detailsCard,
            {
              backgroundColor:
                theme.background,
              borderColor:
                theme.backgroundSelected,
            },
          ]}
        >
          <InformationRow
            icon="calendar-outline"
            label="Date added"
            value={formatDate(
              userMedication.createdAt,
            )}
          />

          <InformationRow
            icon="play-circle-outline"
            label="Start date"
            value={formatDate(
              userMedication.startDate,
            )}
            hideBorder
          />
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor:
              theme.background,
            borderTopColor:
              theme.backgroundSelected,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={handleEdit}
          style={[
            styles.actionButton,
            {
              backgroundColor:
                theme.primary,
            },
          ]}
        >
          <Ionicons
            name="create-outline"
            size={20}
            color={theme.onPrimary}
          />

          <Text
            style={[
              styles.actionButtonText,
              {
                color: theme.onPrimary,
              },
            ]}
          >
            Edit Record
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            disabled:
              isArchived || isArchiving,
            busy: isArchiving,
          }}
          disabled={
            isArchived || isArchiving
          }
          onPress={confirmArchive}
          style={[
            styles.actionButton,
            styles.archiveButton,
            {
              backgroundColor:
                theme.dangerLight,
              borderColor: theme.danger,
              opacity:
                isArchived ||
                isArchiving
                  ? 0.55
                  : 1,
            },
          ]}
        >
          {isArchiving ? (
            <ActivityIndicator
              color={theme.danger}
            />
          ) : (
            <Ionicons
              name="archive-outline"
              size={20}
              color={theme.danger}
            />
          )}

          <Text
            style={[
              styles.actionButtonText,
              {
                color: theme.danger,
              },
            ]}
          >
            {isArchived
              ? "Archived"
              : "Archive"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Header({
  status,
  onBack,
}: {
  status: string | null;
  onBack: () => void;
}) {
  const theme = useTheme();

  const isArchived =
    status === "archived";

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor:
            theme.background,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        onPress={onBack}
        style={[
          styles.backButton,
          {
            backgroundColor:
              theme.backgroundElement,
          },
        ]}
      >
        <Ionicons
          name="chevron-back"
          size={24}
          color={theme.text}
        />
      </Pressable>

      <Text
        style={[
          styles.headerTitle,
          {
            color: theme.text,
          },
        ]}
      >
        Medication Details
      </Text>

      {status ? (
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: isArchived
                ? theme.dangerLight
                : theme.primaryLight,
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              {
                color: isArchived
                  ? theme.danger
                  : theme.primaryDark,
              },
            ]}
          >
            {capitalize(status)}
          </Text>
        </View>
      ) : (
        <View style={styles.headerPlaceholder} />
      )}
    </View>
  );
}

const WARNING_SEVERITY_LABEL: Record<string, string> = {
  contraindicated: "Contraindicated",
  major: "Major",
  high: "High",
  moderate: "Moderate",
  medium: "Medium",
  minor: "Minor",
  low: "Low",
  unknown: "Unverified",
};

const WARNING_TYPE_LABEL: Record<
  MedicationSafetyWarning["warningType"],
  string
> = {
  drug_drug: "Drug interaction",
  drug_allergy: "Allergy conflict",
  drug_condition: "Condition caution",
};

function SafetyWarningsSection({
  warnings,
}: {
  warnings: MedicationSafetyWarning[];
}) {
  const theme = useTheme();

  return (
    <>
      <Text
        style={[
          styles.sectionTitle,
          { color: theme.danger },
        ]}
      >
        SAFETY WARNINGS
      </Text>

      <View
        style={[
          styles.warningsCard,
          { backgroundColor: theme.background, borderColor: theme.danger },
        ]}
      >
        {warnings.map((warning, index) => {
          const severityKey = warning.severity.toLowerCase();
          const isSevere =
            severityKey === "contraindicated" ||
            severityKey === "major" ||
            severityKey === "high";

          return (
            <View
              key={`${warning.warningType}-${index}`}
              style={[
                styles.warningRow,
                index < warnings.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: theme.backgroundElement,
                },
              ]}
            >
              <View style={styles.warningRowTop}>
                <Text
                  style={[
                    styles.warningTypeLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  {WARNING_TYPE_LABEL[warning.warningType]}
                </Text>

                <View
                  style={[
                    styles.warningSeverityPill,
                    {
                      backgroundColor: isSevere
                        ? theme.dangerLight
                        : theme.warningLight,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.warningSeverityText,
                      { color: isSevere ? theme.danger : theme.warning },
                    ]}
                  >
                    {WARNING_SEVERITY_LABEL[severityKey] ?? warning.severity}
                  </Text>
                </View>
              </View>

              {warning.affected && (
                <Text
                  style={[
                    styles.warningAffected,
                    { color: theme.textSecondary },
                  ]}
                >
                  Affected: {warning.affected}
                </Text>
              )}

              <Text style={[styles.warningMessage, { color: theme.text }]}>
                {warning.message}
              </Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

function SectionTitle({
  children,
}: {
  children: string;
}) {
  const theme = useTheme();

  return (
    <Text
      style={[
        styles.sectionTitle,
        {
          color: theme.textSecondary,
        },
      ]}
    >
      {children}
    </Text>
  );
}

function DetailRow({
  label,
  value,
  hideBorder = false,
}: {
  label: string;
  value: string;
  hideBorder?: boolean;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.detailRow,
        !hideBorder && {
          borderBottomColor:
            theme.backgroundSelected,
          borderBottomWidth: 1,
        },
      ]}
    >
      <Text
        style={[
          styles.detailLabel,
          {
            color: theme.textSecondary,
          },
        ]}
      >
        {label}
      </Text>

      <Text
        style={[
          styles.detailValue,
          {
            color: theme.text,
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function InformationRow({
  icon,
  label,
  value,
  hideBorder = false,
}: {
  icon:
    | "calendar-outline"
    | "play-circle-outline";
  label: string;
  value: string;
  hideBorder?: boolean;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.informationRow,
        !hideBorder && {
          borderBottomColor:
            theme.backgroundSelected,
          borderBottomWidth: 1,
        },
      ]}
    >
      <View style={styles.informationLabel}>
        <Ionicons
          name={icon}
          size={18}
          color={theme.textSecondary}
        />

        <Text
          style={[
            styles.informationLabelText,
            {
              color:
                theme.textSecondary,
            },
          ]}
        >
          {label}
        </Text>
      </View>

      <Text
        style={[
          styles.informationValue,
          {
            color: theme.text,
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  header: {
    minHeight: 72,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.04)",
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    flex: 1,
    marginLeft: 12,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.2,
  },

  headerPlaceholder: {
    width: 70,
  },

  statusBadge: {
    minWidth: 70,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: "center",
  },

  statusText: {
    fontSize: 14,
    fontWeight: "700",
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 132,
  },

  summaryCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#173E2A",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },

  medicationIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },

  summaryText: {
    flex: 1,
  },

  medicationName: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.35,
  },

  medicationSubtitle: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 21,
  },

  genericName: {
    marginTop: 2,
    fontSize: 13,
  },

  verifiedRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  verifiedText: {
    fontSize: 12,
    fontWeight: "600",
  },

  sectionTitle: {
    marginTop: 24,
    marginBottom: 10,
    marginLeft: 2,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: 0.75,
  },

  detailsCard: {
    borderWidth: 1,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#173E2A",
    shadowOpacity: 0.035,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },

  warningsCard: {
    borderWidth: 1,
    borderRadius: 20,
    overflow: "hidden",
    elevation: 2,
  },

  warningRow: {
    padding: 16,
  },

  warningRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  warningTypeLabel: {
    fontSize: 13,
    fontWeight: "600",
  },

  warningSeverityPill: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },

  warningSeverityText: {
    fontSize: 11,
    fontWeight: "700",
  },

  warningAffected: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
  },

  warningMessage: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },

  detailRow: {
    minHeight: 64,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
  },

  detailLabel: {
    fontSize: 14,
    flexShrink: 0,
  },

  detailValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "600",
  },

  instructionsCard: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    justifyContent: "center",
    shadowColor: "#173E2A",
    shadowOpacity: 0.035,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },

  instructionsText: {
    fontSize: 15,
    lineHeight: 23,
  },

  informationRow: {
    minHeight: 64,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },

  informationLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  informationLabelText: {
    fontSize: 14,
  },

  informationValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "600",
  },

  footer: {
    minHeight: 90,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
  },

  actionButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  archiveButton: {
    borderWidth: 1,
  },

  actionButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },

  centerState: {
    flex: 1,
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
  },

  stateIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },

  stateText: {
    marginTop: 14,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },

  retryButton: {
    marginTop: 22,
    minWidth: 130,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: "center",
  },

  retryButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
