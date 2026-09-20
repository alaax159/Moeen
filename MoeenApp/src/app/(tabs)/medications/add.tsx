import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
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
  addMedication,
  AddMedicationApiError,
  checkMedicationSafety,
  type DuplicateMedication,
  type MedicationSafetyWarning,
} from "@/features/medications/add/api";
import { MedicationSafetyWarningModal } from "@/features/medications/add/MedicationSafetyWarningModal";
import { DuplicateMedicationWarningModal } from "@/features/medications/add/DuplicateMedicationWarningModal";
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
  AddMedicationPayload,
  DosageForm,
  DosageUnit,
  DurationValue,
  FrequencyValue,
  MedicationSource,
} from "@/features/medications/add/types";
import {
  formatScheduleTime,
  isValidTime,
  parsePositiveInteger,
} from "@/features/medications/add/utils";
import { usePrescriptionDraft } from "@/features/prescription-scan/context";
import {
  applyPrescriptionDraftEdits,
  mapPrescriptionDosageForm,
  mapPrescriptionDuration,
  mapPrescriptionFrequency,
  mapPrescriptionUnit,
  parsePrescriptionTimes,
} from "@/features/prescription-scan/draft-mapping";

export default function AddMedicationScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];
  const { markItemAdded, draft, updateItem } = usePrescriptionDraft();

  /*
   * Salam's search screen passes:
   * id, brandName, genericName, dailyMedId
   */
  const params = useLocalSearchParams<{
    id?: string;
    medicationCatalogId?: string;
    brandName?: string;
    genericName?: string;
    dailyMedId?: string;
    source?: string;
    description?: string;
    prescriptionDose?: string;
    prescriptionRxCui?: string;
    prescriptionUnit?: string;
    prescriptionDosageForm?: string;
    prescriptionFrequency?: string;
    prescriptionDuration?: string;
    prescriptionTimes?: string;
    prescriptionInstructions?: string;
    prescriptionItemIndex?: string;
    prescriptionEditMode?: string;
  }>();

  const rawMedicationId = typeof params.id === "string" ? params.id.trim() : "";

  const parsedMedicationId = Number(rawMedicationId);

  const medicationId =
    Number.isInteger(parsedMedicationId) && parsedMedicationId > 0
      ? parsedMedicationId
      : null;

  const selectedBrandName =
    typeof params.brandName === "string" ? params.brandName.trim() : "";

  const selectedGenericName =
    typeof params.genericName === "string" ? params.genericName.trim() : "";

  const rawMedicationCatalogId =
    typeof params.medicationCatalogId === "string"
      ? params.medicationCatalogId.trim()
      : "";

  const parsedMedicationCatalogId = Number(rawMedicationCatalogId);

  const medicationCatalogId =
    Number.isInteger(parsedMedicationCatalogId) && parsedMedicationCatalogId > 0
      ? parsedMedicationCatalogId
      : null;

  const dailyMedId =
    typeof params.dailyMedId === "string" ? params.dailyMedId.trim() : "";

  const prescriptionRxCui =
    typeof params.prescriptionRxCui === "string"
      ? params.prescriptionRxCui.trim()
      : "";

  const description =
    typeof params.description === "string" ? params.description.trim() : "";

  const prescriptionDose =
    typeof params.prescriptionDose === "string"
      ? params.prescriptionDose.trim()
      : "";

  const prescriptionUnit =
    typeof params.prescriptionUnit === "string"
      ? params.prescriptionUnit.trim()
      : "";

  const prescriptionDosageForm =
    typeof params.prescriptionDosageForm === "string"
      ? params.prescriptionDosageForm.trim()
      : "";

  const prescriptionFrequency =
    typeof params.prescriptionFrequency === "string"
      ? params.prescriptionFrequency.trim()
      : "";

  const prescriptionDuration =
    typeof params.prescriptionDuration === "string"
      ? params.prescriptionDuration.trim()
      : "";

  const prescriptionTimes =
    typeof params.prescriptionTimes === "string"
      ? params.prescriptionTimes.trim()
      : "";

  const prescriptionInstructions =
    typeof params.prescriptionInstructions === "string"
      ? params.prescriptionInstructions.trim()
      : "";

  const initialPrescriptionUnit = mapPrescriptionUnit(prescriptionUnit);

  const initialPrescriptionDosageForm = mapPrescriptionDosageForm(
    prescriptionDosageForm,
  );

  const initialPrescriptionFrequency = mapPrescriptionFrequency(
    prescriptionFrequency,
  );

  const initialPrescriptionDuration =
    mapPrescriptionDuration(prescriptionDuration);

  const initialPrescriptionTimes = parsePrescriptionTimes(prescriptionTimes);

  const prescriptionItemIndex =
    typeof params.prescriptionItemIndex === "string" &&
    /^\d+$/.test(params.prescriptionItemIndex)
      ? Number(params.prescriptionItemIndex)
      : null;

  // Opened from the prescription review screen to edit the scanned draft.
  // In this mode nothing is persisted: saving updates the draft only, and the
  // batch Confirm on the review screen remains the single point that adds
  // medications.
  const isPrescriptionEditMode =
    params.prescriptionEditMode === "1" && prescriptionItemIndex !== null;

  const startingFrequency = initialPrescriptionFrequency ?? "once_daily";

  const startingScheduleTimes =
    startingFrequency === "as_needed"
      ? []
      : initialPrescriptionTimes.length > 0
        ? initialPrescriptionTimes
        : [...DEFAULT_SCHEDULES[startingFrequency]];

  /*
   * Internal mapping:
   *
   * Valid local ID             -> database
   * No local ID + catalogue ID -> palestine_moh
   * No local ID + DailyMed ID  -> dailymed
   * No IDs                     -> manual
   */
  const medicationSource: MedicationSource =
    medicationId !== null
      ? "database"
      : medicationCatalogId !== null && params.source === "palestine_moh"
        ? "palestine_moh"
        : dailyMedId
          ? "dailymed"
          : prescriptionRxCui
            ? "rxnorm"
            : "manual";

  const isManual = medicationSource === "manual";

  const hasSelectedMedicationIdentity =
    selectedBrandName.length > 0 || selectedGenericName.length > 0;

  const [manualBrandName, setManualBrandName] = useState(
    isManual ? selectedBrandName : "",
  );

  const [manualGenericName, setManualGenericName] = useState(
    isManual ? selectedGenericName : "",
  );

  const [dosageAmount, setDosageAmount] = useState(prescriptionDose);

  const [dosageUnit, setDosageUnit] = useState<DosageUnit>(
    initialPrescriptionUnit,
  );

  const [dosageForm, setDosageForm] = useState<DosageForm>(
    initialPrescriptionDosageForm ?? "Tablet",
  );

  const [frequency, setFrequency] = useState<FrequencyValue>(startingFrequency);

  const [scheduleTimes, setScheduleTimes] = useState(startingScheduleTimes);

  const [duration, setDuration] = useState<DurationValue>(
    initialPrescriptionDuration?.duration ?? "1_week",
  );

  const [customDays, setCustomDays] = useState(
    initialPrescriptionDuration?.customDays ?? "",
  );

  const [instructions, setInstructions] = useState(prescriptionInstructions);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingWarnings, setPendingWarnings] = useState<
    MedicationSafetyWarning[] | null
  >(null);

  const [pendingDuplicate, setPendingDuplicate] =
    useState<DuplicateMedication | null>(null);

  const pendingPayloadRef = useRef<AddMedicationPayload | null>(null);

  const pendingSafetyWarningsRef = useRef<MedicationSafetyWarning[]>([]);

  const isSelectedMedication =
    medicationSource !== "manual" && hasSelectedMedicationIdentity;

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
    if (
      medicationSource === "manual" &&
      !manualBrandName.trim() &&
      !manualGenericName.trim()
    ) {
      return showError(
        "Missing information",
        "Please enter at least the brand name or generic name.",
      );
    }

    if (medicationSource === "database" && medicationId === null) {
      return showError(
        "Missing medication ID",
        "Please select the medication again from the search screen.",
      );
    }

    if (medicationSource === "palestine_moh" && medicationCatalogId === null) {
      return showError(
        "Missing medication details",
        "Please select the medication again from the search screen.",
      );
    }

    if (medicationSource === "dailymed" && !dailyMedId) {
      return showError(
        "Missing DailyMed details",
        "Please select the medication again so its details can be loaded.",
      );
    }

    if (medicationSource !== "manual" && !hasSelectedMedicationIdentity) {
      return showError(
        "Missing medication",
        "Please select a medication from the search screen first.",
      );
    }

    const normalizedDose = dosageAmount.trim();
    const numericDose = Number(normalizedDose);

    const hasValidDoseFormat = /^\d+(\.\d{1,2})?$/.test(normalizedDose);

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
      return showError("Missing information", "Please select the dosage unit.");
    }

    if (duration === "custom" && parsePositiveInteger(customDays) === null) {
      return showError(
        "Invalid duration",
        "Custom duration must be a whole number greater than zero.",
      );
    }

    if (scheduleTimes.some((time) => !isValidTime(time))) {
      return showError(
        "Invalid time",
        "Use the 24-hour format HH:MM, for example 08:00.",
      );
    }

    return true;
  }

  async function handleSave() {
    if (isSubmitting || !validateForm() || !dosageUnit) {
      return;
    }

    if (isPrescriptionEditMode) {
      savePrescriptionDraftEdits();
      return;
    }

    const parsedCustomDays =
      duration === "custom" ? parsePositiveInteger(customDays) : null;

    const medication =
      medicationSource === "database"
        ? {
            id: medicationId!,
          }
        : medicationSource === "palestine_moh"
          ? {
              medicationCatalogId: medicationCatalogId!,
              ...(selectedBrandName ? { brandName: selectedBrandName } : {}),
              ...(selectedGenericName
                ? { genericName: selectedGenericName }
                : {}),
              ...(description ? { description } : {}),
            }
          : medicationSource === "dailymed"
          ? {
              ...(selectedBrandName ? { brandName: selectedBrandName } : {}),
              ...(selectedGenericName
                ? { genericName: selectedGenericName }
                : {}),
              dailymedId: dailyMedId,
              ...(description ? { description } : {}),
            }
          : medicationSource === "rxnorm"
            ? {
                ...(selectedBrandName ? { brandName: selectedBrandName } : {}),
                ...(selectedGenericName
                  ? { genericName: selectedGenericName }
                  : {}),
                rxcui: prescriptionRxCui,
                ...(description ? { description } : {}),
              }
            : {
                ...(manualBrandName.trim()
                  ? { brandName: manualBrandName.trim() }
                  : {}),
                ...(manualGenericName.trim()
                  ? { genericName: manualGenericName.trim() }
                  : {}),
              };

    const payload: AddMedicationPayload = {
      source:
        medicationSource === "database" ? "existing_db" : medicationSource,

      medication,

      userMedication: {
        frequency: scheduleTimes.length,

        dosageAmount: Number(dosageAmount),

        dosageUnit,

        dosageForm,

        ...(instructions.trim()
          ? {
              instructions: instructions.trim(),
            }
          : {}),

        completion: "ongoing",

        durationOption: duration,

        ...(parsedCustomDays !== null
          ? {
              customDays: parsedCustomDays,
            }
          : {}),
      },

      scheduleTimes: scheduleTimes.map(formatScheduleTime),
    };

    try {
      setIsSubmitting(true);

      const safety = await checkMedicationSafety(payload);

      if (safety.duplicateMedication) {
        pendingPayloadRef.current = payload;
        pendingSafetyWarningsRef.current = safety.warnings;
        setPendingDuplicate(safety.duplicateMedication);
        setIsSubmitting(false);
        return;
      }

      if (safety.warnings.length > 0) {
        pendingPayloadRef.current = payload;
        pendingSafetyWarningsRef.current = safety.warnings;
        setPendingWarnings(safety.warnings);
        setIsSubmitting(false);
        return;
      }

      await saveMedication(payload);
    } catch (error) {
      console.error("MEDICATION SAFETY CHECK ERROR:", error);

      const message =
        error instanceof AddMedicationApiError
          ? error.message
          : "Could not connect to the server. Please try again.";

      Alert.alert("Unable to check medication safety", message);
      setIsSubmitting(false);
    }
  }

  // Saves the edited values back onto the scanned prescription draft and
  // returns to the review screen. No safety check and no add-medication call
  // happen here - the medication is not persisted until Confirm.
  function savePrescriptionDraftEdits() {
    const item =
      prescriptionItemIndex !== null
        ? draft?.items[prescriptionItemIndex]
        : undefined;

    if (!item || prescriptionItemIndex === null) {
      Alert.alert(
        "Unable to save changes",
        "This prescription medication is no longer available.",
      );
      return;
    }

    updateItem(
      prescriptionItemIndex,
      applyPrescriptionDraftEdits(item, {
        name: isManual ? manualGenericName : selectedGenericName,
        dose: dosageAmount,
        unit: dosageUnit,
        dosageForm,
        frequency,
        duration,
        customDays,
        times: scheduleTimes,
        instructions,
      }),
    );

    router.back();
  }

  async function saveMedication(payload: AddMedicationPayload) {
    try {
      setIsSubmitting(true);

      await addMedication(payload);

      if (prescriptionItemIndex !== null) {
        markItemAdded(prescriptionItemIndex);
      }

      Alert.alert(
        "Medication added",
        "Your medication was added successfully.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/medications"),
          },
        ],
      );
    } catch (error) {
      console.error("ADD MEDICATION ERROR:", error);

      const message =
        error instanceof AddMedicationApiError
          ? error.message
          : "Could not connect to the server. Please try again.";

      Alert.alert("Unable to add medication", message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDuplicateGoBack() {
    pendingPayloadRef.current = null;
    pendingSafetyWarningsRef.current = [];
    setPendingDuplicate(null);
  }

  function handleDuplicateContinueAnyway() {
    const payload = pendingPayloadRef.current;
    const warnings = pendingSafetyWarningsRef.current;

    setPendingDuplicate(null);

    if (!payload) {
      pendingSafetyWarningsRef.current = [];
      return;
    }

    if (warnings.length > 0) {
      setPendingWarnings(warnings);
      return;
    }

    pendingPayloadRef.current = null;
    pendingSafetyWarningsRef.current = [];

    void saveMedication(payload);
  }

  function handleSafetyWarningGoBack() {
    pendingPayloadRef.current = null;
    pendingSafetyWarningsRef.current = [];
    setPendingWarnings(null);
  }

  function handleSafetyWarningContinueAnyway() {
    const payload = pendingPayloadRef.current;

    setPendingWarnings(null);
    pendingPayloadRef.current = null;
    pendingSafetyWarningsRef.current = [];

    if (payload) {
      void saveMedication(payload);
    }
  }

  const normalizedDose = dosageAmount.trim();
  const numericDose = Number(normalizedDose);

  const hasValidDose =
    /^\d+(\.\d{1,2})?$/.test(normalizedDose) &&
    Number.isFinite(numericDose) &&
    numericDose > 0;

  const hasValidMedication =
    medicationSource === "manual"
      ? manualBrandName.trim().length > 0 || manualGenericName.trim().length > 0
      : hasSelectedMedicationIdentity && isSelectedMedication;

  const hasValidCustomDays =
    duration !== "custom" || parsePositiveInteger(customDays) !== null;

  const canSave =
    hasValidMedication &&
    hasValidDose &&
    dosageUnit !== "" &&
    hasValidCustomDays &&
    scheduleTimes.every(isValidTime);

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
              {isPrescriptionEditMode ? "Edit Medication" : "Add Medication"}
            </ThemedText>

            <ThemedText
              style={[
                styles.subtitle,
                {
                  color: colors.textSecondary,
                },
              ]}
            >
              Fill in the details from your prescription
            </ThemedText>
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

            <ThemedText
              style={[
                styles.fieldLabel,
                {
                  color: colors.textSecondary,
                },
              ]}
            >
              Brand Name
            </ThemedText>

            <TextInput
              accessibilityLabel="Brand name"
              value={isManual ? manualBrandName : selectedBrandName}
              onChangeText={isManual ? setManualBrandName : undefined}
              editable={isManual}
              autoCapitalize="words"
              placeholder={
                isManual ? "Enter brand name" : "Brand name not available"
              }
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.field,
                {
                  color: colors.text,
                  backgroundColor: isManual
                    ? colors.backgroundElement
                    : colors.backgroundSelected,
                  borderColor: colors.backgroundSelected,
                },
              ]}
            />

            <ThemedText
              style={[
                styles.fieldLabel,
                styles.fieldSpacing,
                {
                  color: colors.textSecondary,
                },
              ]}
            >
              Generic Name
            </ThemedText>

            <TextInput
              accessibilityLabel="Generic name"
              value={isManual ? manualGenericName : selectedGenericName}
              onChangeText={isManual ? setManualGenericName : undefined}
              editable={isManual}
              autoCapitalize="words"
              placeholder={
                isManual ? "Enter generic name" : "Generic name not available"
              }
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.field,
                {
                  color: colors.text,
                  backgroundColor: isManual
                    ? colors.backgroundElement
                    : colors.backgroundSelected,
                  borderColor: colors.backgroundSelected,
                },
              ]}
            />

            {isSelectedMedication && (
              <View style={styles.verifiedRow}>
                <Ionicons
                  name="checkmark-circle"
                  size={17}
                  color={colors.success}
                />

                <ThemedText
                  style={[
                    styles.verifiedText,
                    {
                      color: colors.success,
                    },
                  ]}
                >
                  {medicationSource === "dailymed"
                    ? "Selected from DailyMed"
                    : medicationSource === "rxnorm"
                      ? "Matched with RxNorm"
                      : "Selected from medication database"}
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
              options={DURATIONS}
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
            accessibilityLabel="Save medication"
            accessibilityState={{
              disabled: !canSave || isSubmitting,
              busy: isSubmitting,
            }}
            disabled={!canSave || isSubmitting}
            onPress={handleSave}
            style={[
              styles.saveButton,
              {
                backgroundColor:
                  canSave && !isSubmitting
                    ? colors.primary
                    : colors.backgroundSelected,
              },
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color={canSave ? colors.onPrimary : colors.textSecondary}
              />
            )}

            <ThemedText
              style={[
                styles.saveButtonText,
                {
                  color:
                    canSave && !isSubmitting
                      ? colors.onPrimary
                      : colors.textSecondary,
                },
              ]}
            >
              {isPrescriptionEditMode
                ? "Save Changes"
                : isSubmitting
                  ? "Saving..."
                  : "Save Medication"}
            </ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <DuplicateMedicationWarningModal
        visible={pendingDuplicate !== null}
        duplicateMedication={pendingDuplicate}
        onGoBack={handleDuplicateGoBack}
        onContinueAnyway={handleDuplicateContinueAnyway}
      />

      <MedicationSafetyWarningModal
        visible={pendingWarnings !== null}
        warnings={pendingWarnings ?? []}
        isSaving={isSubmitting}
        onGoBack={handleSafetyWarningGoBack}
        onContinueAnyway={handleSafetyWarningContinueAnyway}
      />
    </SafeAreaView>
  );
}
