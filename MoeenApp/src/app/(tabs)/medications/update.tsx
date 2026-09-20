import Ionicons from "@expo/vector-icons/Ionicons";
import {
  router,
  useLocalSearchParams,
} from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Colors } from "@/constants/theme";
import {
  DEFAULT_SCHEDULES,
  DOSAGE_FORMS,
  DOSAGE_UNITS,
  DURATIONS,
  FREQUENCIES,
} from "@/features/medications/add/constants";
import { MedicationDropdown } from "@/features/medications/add/MedicationDropdown";
import { styles } from "@/features/medications/add/styles";
import type {
  DosageForm,
  DosageUnit,
  FrequencyValue,
  Option,
} from "@/features/medications/add/types";
import {
  formatScheduleTime,
  isValidTime,
  parsePositiveInteger,
} from "@/features/medications/add/utils";
import {
  getMedicationDetails,
  MedicationDetailsApiError,
} from "@/features/medications/details/api";
import type {
  MedicationDetailsResponse,
  UserMedicationDetails,
} from "@/features/medications/details/types";
import {
  updateMedication,
  UpdateMedicationApiError,
} from "@/features/medications/update/api";
import type {
  UpdateDurationValue,
  UpdateMedicationPayload,
} from "@/features/medications/update/types";

const UPDATE_DURATIONS: Option<UpdateDurationValue>[] = [
  ...DURATIONS,
  {
    label: "Ongoing",
    value: "ongoing",
  },
];

function frequencyFromCount(
  frequency: number,
): FrequencyValue {
  switch (frequency) {
    case 0:
      return "as_needed";
    case 1:
      return "once_daily";
    case 2:
      return "twice_daily";
    case 3:
      return "three_times_daily";
    case 4:
      return "four_times_daily";
    default:
      return "once_daily";
  }
}

function durationFromDates(
  startDate: string,
  endDate: string | null,
): {
  duration: UpdateDurationValue;
  customDays: string;
} {
  if (!endDate) {
    return {
      duration: "ongoing",
      customDays: "",
    };
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return {
      duration: "ongoing",
      customDays: "",
    };
  }

  const millisecondsPerDay =
    24 * 60 * 60 * 1000;

  const numberOfDays = Math.max(
    1,
    Math.round(
      (end.getTime() - start.getTime()) /
        millisecondsPerDay,
    ),
  );

  switch (numberOfDays) {
    case 3:
      return {
        duration: "3_days",
        customDays: "",
      };

    case 7:
      return {
        duration: "1_week",
        customDays: "",
      };

    case 14:
      return {
        duration: "2_weeks",
        customDays: "",
      };

    case 30:
    case 31:
      return {
        duration: "1_month",
        customDays: "",
      };

    default:
      return {
        duration: "custom",
        customDays: String(numberOfDays),
      };
  }
}

function isDosageUnit(
  value: string,
): value is Exclude<DosageUnit, ""> {
  return (
    value !== "" &&
    DOSAGE_UNITS.some(
      (option) => option.value === value,
    )
  );
}

function isDosageForm(
  value: string,
): value is DosageForm {
  return DOSAGE_FORMS.some(
    (option) => option.value === value,
  );
}

function normalizeScheduleTime(value: string): string {
  const [hours = "", minutes = ""] = value.split(":");

  if (!hours || !minutes) {
    return value;
  }

  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

export default function UpdateMedicationScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];

  /*
   * Salam's search screen passes:
   * id, name, genericName, verified, dailyMedId, description
   */
  const params = useLocalSearchParams<{
  id?: string;
}>();

const rawId =
  typeof params.id === "string"
    ? params.id.trim()
    : "";

const parsedId = Number(rawId);

const userMedicationId =
  Number.isInteger(parsedId) && parsedId > 0
    ? parsedId
    : null;

const [details, setDetails] =
  useState<MedicationDetailsResponse | null>(null);

const [userMedication, setUserMedication] =
  useState<UserMedicationDetails | null>(null);

const [dosageAmount, setDosageAmount] =
  useState("");

const [dosageUnit, setDosageUnit] =
  useState<DosageUnit>("");

const [dosageForm, setDosageForm] =
  useState<DosageForm>("Tablet");

const [frequency, setFrequency] =
  useState<FrequencyValue>("once_daily");

const [scheduleTimes, setScheduleTimes] =
  useState(["08:00"]);

const [duration, setDuration] =
  useState<UpdateDurationValue>("1_week");

const [customDays, setCustomDays] =
  useState("");

const [instructions, setInstructions] =
  useState("");

const [isLoading, setIsLoading] =
  useState(true);

const [isSubmitting, setIsSubmitting] =
  useState(false);

const [errorMessage, setErrorMessage] =
  useState<string | null>(null);

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

const verificationLabel = !details?.medication.verificationSource
  ? null
  : details.medication.verificationStatus !== "verified"
    ? "Unverified manual entry"
    : details.medication.verificationSource === "palestine_moh"
      ? "Palestinian MOH"
      : details.medication.verificationSource === "dailymed"
        ? "DailyMed"
        : "RxNorm";

const populateForm = useCallback(
  (record: UserMedicationDetails) => {
    setDosageAmount(
      String(record.dosageAmount),
    );

    setDosageUnit(
      isDosageUnit(record.dosageUnit)
        ? record.dosageUnit
        : "",
    );

    setDosageForm(
      isDosageForm(record.dosageForm)
        ? record.dosageForm
        : "Other",
    );

    setFrequency(
      frequencyFromCount(record.frequency),
    );

    setScheduleTimes(
      record.scheduleTimes.length > 0
        ? record.scheduleTimes.map((item) =>
            normalizeScheduleTime(item.time),
          )
        : [],
    );

    const initialDuration =
      durationFromDates(
        record.startDate,
        record.endDate,
      );

    setDuration(initialDuration.duration);

    setCustomDays(
      initialDuration.customDays,
    );

    setInstructions(
      record.instructions ?? "",
    );
  },
  [],
);

const loadMedication =
  useCallback(async () => {
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

      const matchingRecord =
        response.userMedications.find(
          (item) =>
            item.id === userMedicationId,
        );

      if (!matchingRecord) {
        setDetails(null);
        setUserMedication(null);

        setErrorMessage(
          "No matching medication record was found.",
        );

        return;
      }

      setDetails(response);
      setUserMedication(matchingRecord);
      populateForm(matchingRecord);
    } catch (error) {
      const message =
        error instanceof
        MedicationDetailsApiError
          ? error.message
          : "Could not load the medication record.";

      setDetails(null);
      setUserMedication(null);
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }, [
    populateForm,
    userMedicationId,
  ]);

  useEffect(() => {
  void loadMedication();
}, [loadMedication]);

  function handleFrequencyChange(value: FrequencyValue) {
    setFrequency(value);
    setScheduleTimes([...DEFAULT_SCHEDULES[value]]);
  }

  function updateScheduleTime(index: number, value: string) {
    setScheduleTimes((currentTimes) =>
      currentTimes.map((time, currentIndex) =>
        currentIndex === index ? value : time,
      ),
    );
  }

  function showError(title: string, message: string): false {
    Alert.alert(title, message);
    return false;
  }

 function validateForm(): boolean {
  const normalizedDose = dosageAmount.trim();
  const numericDose = Number(normalizedDose);

  const hasValidDoseFormat =
    /^\d+(\.\d{1,2})?$/.test(normalizedDose);

  if (
    !hasValidDoseFormat ||
    !Number.isFinite(numericDose) ||
    numericDose <= 0
  ) {
    return showError(
      "Invalid dose",
      "Dose must be greater than zero and contain at most two decimal places.",
    );
  }

  if (!dosageUnit) {
    return showError(
      "Missing information",
      "Please select the dosage unit.",
    );
  }

  if (
    duration === "custom" &&
    parsePositiveInteger(customDays) === null
  ) {
    return showError(
      "Invalid duration",
      "Custom duration must be a whole number greater than zero.",
    );
  }

  if (
    scheduleTimes.some(
      (time) => !isValidTime(time),
    )
  ) {
    return showError(
      "Invalid time",
      "Use the 24-hour format HH:MM, for example 08:00.",
    );
  }

  return true;
}

async function handleUpdate() {
  if (
    isSubmitting ||
    userMedicationId === null ||
    !userMedication ||
    !validateForm() ||
    !dosageUnit
  ) {
    return;
  }

  const parsedCustomDays =
    duration === "custom"
      ? parsePositiveInteger(customDays)
      : null;

  const payload: UpdateMedicationPayload = {
    frequency: scheduleTimes.length,

    dosageAmount: Number(dosageAmount),

    dosageUnit,

    dosageForm,

    instructions: instructions.trim(),

    scheduleTimes:
      scheduleTimes.map(formatScheduleTime),

    durationOption: duration,

    ...(parsedCustomDays !== null
      ? {
          customDays: parsedCustomDays,
        }
      : {}),
  };

  try {
    setIsSubmitting(true);

    await updateMedication(
      userMedicationId,
      payload,
    );

    Alert.alert(
      "Medication updated",
      "Your medication record was updated successfully.",
      [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ],
    );
  } catch (error) {
    const message =
      error instanceof UpdateMedicationApiError
        ? error.message
        : "Could not connect to the server. Please try again.";

    Alert.alert(
      "Unable to update medication",
      message,
    );
  } finally {
    setIsSubmitting(false);
  }
}

const normalizedDose = dosageAmount.trim();
const numericDose = Number(normalizedDose);

const hasValidDose =
  /^\d+(\.\d{1,2})?$/.test(
    normalizedDose,
  ) &&
  Number.isFinite(numericDose) &&
  numericDose > 0;

const hasValidCustomDays =
  duration !== "custom" ||
  parsePositiveInteger(customDays) !== null;

const canUpdate =
  userMedication !== null &&
  hasValidDose &&
  dosageUnit !== "" &&
  hasValidCustomDays &&
  scheduleTimes.every(isValidTime);
  if (isLoading) {
  return (
    <SafeAreaView
      edges={["top"]}
      style={[
        styles.screen,
        {
          backgroundColor:
            colors.backgroundElement,
        },
      ]}
    >
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <ActivityIndicator
          size="large"
          color={colors.primary}
        />

        <ThemedText
          style={{
            marginTop: 16,
            color: colors.textSecondary,
            textAlign: "center",
          }}
        >
          Loading medication details...
        </ThemedText>
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
            colors.backgroundElement,
        },
      ]}
    >
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Ionicons
          name="alert-circle-outline"
          size={44}
          color={colors.danger}
        />

        <ThemedText
          style={{
            marginTop: 16,
            color: colors.text,
            fontSize: 18,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          Unable to load medication
        </ThemedText>

        <ThemedText
          style={{
            marginTop: 8,
            color: colors.textSecondary,
            textAlign: "center",
          }}
        >
          {errorMessage ??
            "Medication details are unavailable."}
        </ThemedText>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void loadMedication();
          }}
          style={{
            marginTop: 22,
            minWidth: 130,
            paddingHorizontal: 20,
            paddingVertical: 13,
            borderRadius: 16,
            alignItems: "center",
            backgroundColor: colors.primary,
          }}
        >
          <ThemedText
            style={{
              color: colors.onPrimary,
              fontWeight: "700",
            }}
          >
            Try Again
          </ThemedText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={{
            marginTop: 14,
            paddingHorizontal: 20,
            paddingVertical: 12,
          }}
        >
          <ThemedText
            style={{
              color: colors.primary,
              fontWeight: "600",
            }}
          >
            Go Back
          </ThemedText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
  return (
    <SafeAreaView
      edges={["top"]}
      style={[
        styles.screen,
        {
          backgroundColor: colors.backgroundElement,
        },
      ]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.screen}
      >
        <View
          style={[
            styles.header,
            {
              backgroundColor: colors.background,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            onPress={() => router.back()}
            style={[
              styles.circleButton,
              {
                backgroundColor: colors.backgroundElement,
              },
            ]}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>

          <View style={styles.headerText}>
            <ThemedText
              style={[
                styles.title,
                {
                  color: colors.text,
                },
              ]}
            >
              Update Medication
            </ThemedText>

            <ThemedText
              style={[
                styles.subtitle,
                {
                  color: colors.textSecondary,
                },
              ]}
            >
              Review and update your prescription details
            </ThemedText>
          </View>

          <View
            style={[
              styles.circleButton,
              {
                backgroundColor: colors.primaryLight,
              },
            ]}
          >
            <Ionicons
              name={
                details?.medication.verificationStatus === "verified"
                  ? "shield-checkmark"
                  : "medical-outline"
              }
              size={23}
              color={colors.primary}
            />
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.background,
                borderColor: colors.backgroundSelected,
              },
            ]}
          >
            <ThemedText
              style={[
                styles.cardLabel,
                {
                  color: colors.text,
                },
              ]}
            >
              Medication
            </ThemedText>

            <TextInput
  accessibilityLabel="Medication name"
  value={medicationName}
  editable={false}
  autoCapitalize="words"
  placeholder="Medication"
  placeholderTextColor={
    colors.textSecondary
  }
  style={[
    styles.field,
    {
      color: colors.text,

      backgroundColor:
        colors.backgroundSelected,

      borderColor:
        colors.backgroundSelected,
    },
  ]}
/>

            {verificationLabel && (
              <View style={styles.verifiedRow}>
                <Ionicons
                  name={
                    details?.medication.verificationStatus === "verified"
                      ? "checkmark-circle"
                      : "alert-circle-outline"
                  }
                  size={17}
                  color={
                    details?.medication.verificationStatus === "verified"
                      ? colors.success
                      : colors.textSecondary
                  }
                />

                <ThemedText
                  style={[
                    styles.verifiedText,
                    {
                      color:
                        details?.medication.verificationStatus === "verified"
                          ? colors.success
                          : colors.textSecondary,
                    },
                  ]}
                >
                  {verificationLabel}
                </ThemedText>
              </View>
            )}
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.background,
                borderColor: colors.backgroundSelected,
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <View
                style={[
                  styles.sectionIconContainer,
                  {
                    backgroundColor: colors.primaryLight,
                  },
                ]}
              >
                <Ionicons
                  name="medical-outline"
                  size={18}
                  color={colors.primary}
                />
              </View>

              <ThemedText
                style={[
                  styles.sectionTitle,
                  {
                    color: colors.text,
                  },
                ]}
              >
                DOSAGE
              </ThemedText>
            </View>

            <View style={styles.twoColumns}>
              <View style={styles.column}>
                <ThemedText
                  style={[
                    styles.fieldLabel,
                    {
                      color: colors.textSecondary,
                    },
                  ]}
                >
                  Dose Amount
                </ThemedText>

                <TextInput
                  accessibilityLabel="Dosage amount"
                  value={dosageAmount}
                  onChangeText={setDosageAmount}
                  keyboardType="decimal-pad"
                  placeholder="500"
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    styles.field,
                    {
                      color: colors.text,
                      backgroundColor: colors.backgroundElement,
                      borderColor: colors.backgroundSelected,
                    },
                  ]}
                />
              </View>

              <View style={styles.column}>
                <ThemedText
                  style={[
                    styles.fieldLabel,
                    {
                      color: colors.textSecondary,
                    },
                  ]}
                >
                  Unit
                </ThemedText>

                <MedicationDropdown
                  label="Dosage unit"
                  value={dosageUnit}
                  options={DOSAGE_UNITS}
                  onChange={setDosageUnit}
                />
              </View>
            </View>

            <ThemedText
              style={[
                styles.fieldLabel,
                styles.fieldSpacing,
                {
                  color: colors.textSecondary,
                },
              ]}
            >
              Form
            </ThemedText>

            <MedicationDropdown
              label="Dosage form"
              value={dosageForm}
              options={DOSAGE_FORMS}
              onChange={setDosageForm}
            />
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.background,
                borderColor: colors.backgroundSelected,
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <View
                style={[
                  styles.sectionIconContainer,
                  {
                    backgroundColor: colors.primaryLight,
                  },
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={19}
                  color={colors.primary}
                />
              </View>

              <ThemedText
                style={[
                  styles.sectionTitle,
                  {
                    color: colors.text,
                  },
                ]}
              >
                FREQUENCY & SCHEDULE
              </ThemedText>
            </View>

            <ThemedText
              style={[
                styles.fieldLabel,
                {
                  color: colors.textSecondary,
                },
              ]}
            >
              Frequency
            </ThemedText>

            <MedicationDropdown
              label="Frequency"
              value={frequency}
              options={FREQUENCIES}
              onChange={handleFrequencyChange}
            />

            {frequency !== "as_needed" && (
              <View style={styles.timeGrid}>
                {scheduleTimes.map((time, index) => (
                  <View
                    key={`time-${index}`}
                    style={[
                      styles.timeChip,
                      {
                        backgroundColor: colors.primaryLight,
                        borderColor: colors.primaryLight,
                      },
                    ]}
                  >
                    <Ionicons
                      name={index === 0 ? "sunny-outline" : "time-outline"}
                      size={17}
                      color={colors.primary}
                    />

                    <TextInput
                      accessibilityLabel={`Dose ${index + 1} time`}
                      value={time}
                      onChangeText={(value) => updateScheduleTime(index, value)}
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                      style={[
                        styles.timeInput,
                        {
                          color: colors.primaryDark,
                        },
                      ]}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.background,
                borderColor: colors.backgroundSelected,
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <View
                style={[
                  styles.sectionIconContainer,
                  {
                    backgroundColor: colors.primaryLight,
                  },
                ]}
              >
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={colors.primary}
                />
              </View>

              <ThemedText
                style={[
                  styles.sectionTitle,
                  {
                    color: colors.text,
                  },
                ]}
              >
                DURATION
              </ThemedText>
            </View>

            <ThemedText
              style={[
                styles.fieldLabel,
                {
                  color: colors.textSecondary,
                },
              ]}
            >
              Duration
            </ThemedText>

            <MedicationDropdown
              label="Duration"
              value={duration}
              options={UPDATE_DURATIONS}
              onChange={setDuration}
            />

            {duration === "custom" && (
              <>
                <ThemedText
                  style={[
                    styles.fieldLabel,
                    styles.fieldSpacing,
                    {
                      color: colors.textSecondary,
                    },
                  ]}
                >
                  Number of days
                </ThemedText>

                <TextInput
                  accessibilityLabel="Custom duration in days"
                  value={customDays}
                  onChangeText={setCustomDays}
                  keyboardType="number-pad"
                  placeholder="e.g. 10"
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    styles.field,
                    {
                      color: colors.text,
                      backgroundColor: colors.backgroundElement,
                      borderColor: colors.backgroundSelected,
                    },
                  ]}
                />
              </>
            )}

            <View
              style={[
                styles.endDateBanner,
                {
                  backgroundColor: colors.primaryLight,
                },
              ]}
            >
              <Ionicons name="calendar" size={17} color={colors.primary} />

              <ThemedText
                style={[
                  styles.endDateText,
                  {
                    color: colors.primaryDark,
                  },
                ]}
              >
                Treatment starts today. The end date is calculated
                automatically.
              </ThemedText>
            </View>
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.background,
                borderColor: colors.backgroundSelected,
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <View
                style={[
                  styles.sectionIconContainer,
                  {
                    backgroundColor: colors.primaryLight,
                  },
                ]}
              >
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color={colors.primary}
                />
              </View>

              <ThemedText
                style={[
                  styles.sectionTitle,
                  {
                    color: colors.text,
                  },
                ]}
              >
                INSTRUCTIONS
              </ThemedText>
            </View>

            <TextInput
              accessibilityLabel="Medication instructions"
              value={instructions}
              onChangeText={setInstructions}
              autoCapitalize="sentences"
              placeholder="e.g. Take with food, avoid dairy, take at bedtime..."
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              style={[
                styles.instructionsInput,
                {
                  color: colors.text,
                  backgroundColor: colors.backgroundElement,
                  borderColor: colors.backgroundSelected,
                },
              ]}
            />
          </View>

          <View
            style={[
              styles.warningBox,
              {
                backgroundColor: colors.warningLight,
                borderColor: colors.warning,
              },
            ]}
          >
            <Ionicons name="warning-outline" size={21} color={colors.warning} />

            <ThemedText
              style={[
                styles.warningText,
                {
                  color: colors.warning,
                },
              ]}
            >
              Moeen does not calculate, verify, or recommend dosages. Always
              enter the exact dose prescribed by your doctor.
            </ThemedText>
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.backgroundSelected,
            },
          ]}
        >
          <Pressable
  accessibilityRole="button"
  accessibilityLabel="Update medication"
  accessibilityState={{
    disabled:
      !canUpdate || isSubmitting,

    busy: isSubmitting,
  }}
  disabled={
    !canUpdate || isSubmitting
  }
  onPress={handleUpdate}
  style={[
    styles.saveButton,
    {
      backgroundColor:
        canUpdate && !isSubmitting
          ? colors.primary
          : colors.backgroundSelected,
    },
  ]}
>
  {isSubmitting ? (
    <ActivityIndicator
      color={colors.onPrimary}
    />
  ) : (
    <Ionicons
      name="shield-checkmark-outline"
      size={20}
      color={
        canUpdate
          ? colors.onPrimary
          : colors.textSecondary
      }
    />
  )}

  <ThemedText
    style={[
      styles.saveButtonText,
      {
        color:
          canUpdate && !isSubmitting
            ? colors.onPrimary
            : colors.textSecondary,
      },
    ]}
  >
    {isSubmitting
      ? "Updating..."
      : "Update Medication"}
  </ThemedText>
</Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
