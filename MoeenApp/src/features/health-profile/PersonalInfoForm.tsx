import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { AllergyCard } from './AllergyCard';
import { AllergyForm } from './AllergyForm';
import {
  addAllergy,
  addChronicCondition,
  deleteAllergy,
  deleteChronicCondition,
  getUserAllergies,
  getUserChronicConditions,
} from './api';
import { ConditionCard } from './ConditionCard';
import { ConditionForm } from './ConditionForm';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { RecordFormModal } from './RecordFormModal';
import type {
  Allergy,
  AllergyInput,
  BloodType,
  ChronicCondition,
  ChronicConditionInput,
  Gender,
  HealthKnowledgeStatus,
  PersonalInfo,
} from './types';
import {
  BLOOD_TYPE_OPTIONS,
  DATE_PATTERN,
  E164_PHONE_PATTERN,
  GENDER_LABEL,
  GENDER_OPTIONS,
  isFutureDate,
  KNOWLEDGE_STATUS_LABEL,
  KNOWLEDGE_STATUS_OPTIONS,
} from './utils';

interface PersonalInfoFormProps {
  initialValues: Partial<PersonalInfo>;
  onSubmit: (input: PersonalInfo) => Promise<void>;
}

function RecordsPanel<T extends { id: number }>({
  visible,
  isLoading,
  items,
  renderItem,
  emptyLabel,
  addLabel,
  onAdd,
}: {
  visible: boolean;
  isLoading: boolean;
  items: T[];
  renderItem: (item: T) => ReactNode;
  emptyLabel: string;
  addLabel: string;
  onAdd: () => void;
}) {
  const theme = useTheme();

  if (!visible) return null;

  return (
    <View style={styles.recordsPanel}>
      {isLoading ? (
        <ActivityIndicator color={theme.primary} style={styles.recordsLoading} />
      ) : items.length === 0 ? (
        <Text style={[styles.recordsEmpty, { color: theme.textSecondary }]}>{emptyLabel}</Text>
      ) : (
        <View style={styles.recordsList}>{items.map((item) => renderItem(item))}</View>
      )}

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={addLabel}
        activeOpacity={0.8}
        onPress={onAdd}
        style={styles.addButton}
      >
        <Ionicons name="add" size={16} color={theme.primary} />
        <Text style={[styles.addText, { color: theme.primary }]}>{addLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function SegmentedPicker<T extends string>({
  options,
  value,
  labels,
  onChange,
  disabledOptions,
}: {
  options: T[];
  value: T | null;
  labels: Record<T, string>;
  onChange: (option: T) => void;
  disabledOptions?: T[];
}) {
  const theme = useTheme();
  return (
    <View style={styles.segmentRow}>
      {options.map((option) => {
        const selected = option === value;
        const disabled = disabledOptions?.includes(option) ?? false;
        return (
          <TouchableOpacity
            key={option}
            activeOpacity={0.8}
            disabled={disabled}
            onPress={() => onChange(option)}
            style={[
              styles.segmentButton,
              {
                backgroundColor: selected ? theme.primary : theme.background,
                borderColor: selected ? theme.primary : theme.backgroundSelected,
                opacity: disabled ? 0.4 : 1,
              },
            ]}
          >
            <Text style={[styles.segmentText, { color: selected ? theme.onPrimary : theme.textSecondary }]}>
              {labels[option]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function PersonalInfoForm({ initialValues, onSubmit }: PersonalInfoFormProps) {
  const theme = useTheme();

  const [firstName, setFirstName] = useState(initialValues.firstName ?? '');
  const [lastName, setLastName] = useState(initialValues.lastName ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(initialValues.dateOfBirth ?? '');
  const [weightKg, setWeightKg] = useState(initialValues.weightKg != null ? String(initialValues.weightKg) : '');
  const [heightCm, setHeightCm] = useState(initialValues.heightCm != null ? String(initialValues.heightCm) : '');
  const [gender, setGender] = useState<Gender | null>(initialValues.gender ?? null);
  const [bloodType, setBloodType] = useState<BloodType | null>(initialValues.bloodType ?? null);
  const [allergyKnowledgeStatus, setAllergyKnowledgeStatus] =
    useState<HealthKnowledgeStatus | null>(
      initialValues.allergyKnowledgeStatus === 'unknown'
        ? null
        : (initialValues.allergyKnowledgeStatus ?? null),
    );
  const [conditionKnowledgeStatus, setConditionKnowledgeStatus] =
    useState<HealthKnowledgeStatus | null>(
      initialValues.conditionKnowledgeStatus === 'unknown'
        ? null
        : (initialValues.conditionKnowledgeStatus ?? null),
    );
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(initialValues.emergencyContactPhone ?? '');
  const [doctorName, setDoctorName] = useState(initialValues.doctorName ?? '');
  const [doctorPhone, setDoctorPhone] = useState(initialValues.doctorPhone ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [conditions, setConditions] = useState<ChronicCondition[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [recordsLoadFailed, setRecordsLoadFailed] = useState(false);
  const [activeModal, setActiveModal] = useState<'allergy' | 'condition' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<
    { kind: 'allergy' | 'condition'; id: number; name: string } | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadRecords() {
      try {
        const [loadedAllergies, loadedConditions] = await Promise.all([
          getUserAllergies(),
          getUserChronicConditions(),
        ]);
        if (active) {
          setAllergies(loadedAllergies);
          setConditions(loadedConditions);
        }
      } catch {
        // The knowledge-status guard below relies on knowing the real record
        // counts, so a failed load must block submission rather than silently
        // behaving as if there are zero records.
        if (active) setRecordsLoadFailed(true);
      } finally {
        if (active) setIsLoadingRecords(false);
      }
    }

    void loadRecords();

    return () => {
      active = false;
    };
  }, []);

  const handleAddAllergy = async (input: AllergyInput) => {
    const created = await addAllergy(input);
    setAllergies((current) => [...current, created]);
    setActiveModal(null);
  };

  const handleAddCondition = async (input: ChronicConditionInput) => {
    const created = await addChronicCondition(input);
    setConditions((current) => [...current, created]);
    setActiveModal(null);
  };

  const handleCancelDelete = () => {
    setPendingDelete(null);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || isDeleting) return;

    const { kind, id } = pendingDelete;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      if (kind === 'allergy') {
        await deleteAllergy(id);
        const next = allergies.filter((allergy) => allergy.id !== id);
        setAllergies(next);
        if (next.length === 0) setAllergyKnowledgeStatus('none_known');
      } else {
        await deleteChronicCondition(id);
        const next = conditions.filter((condition) => condition.id !== id);
        setConditions(next);
        if (next.length === 0) setConditionKnowledgeStatus('none_known');
      }
      setPendingDelete(null);
    } catch {
      setDeleteError('Unable to delete. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const weightNum = Number(weightKg);
  const heightNum = Number(heightCm);
  const trimmedEmergencyPhone = emergencyContactPhone.trim();
  const trimmedDoctorPhone = doctorPhone.trim();

  const isValid =
    gender !== null &&
    bloodType !== null &&
    allergyKnowledgeStatus !== null &&
    conditionKnowledgeStatus !== null &&
    !isLoadingRecords &&
    !recordsLoadFailed &&
    (allergyKnowledgeStatus !== 'has_records' || allergies.length > 0) &&
    (conditionKnowledgeStatus !== 'has_records' || conditions.length > 0) &&
    firstName.trim().length > 0 &&
    firstName.trim().length <= 100 &&
    lastName.trim().length > 0 &&
    lastName.trim().length <= 100 &&
    DATE_PATTERN.test(dateOfBirth.trim()) &&
    !isFutureDate(dateOfBirth.trim()) &&
    Number.isFinite(weightNum) &&
    weightNum >= 1 &&
    weightNum <= 500 &&
    Number.isFinite(heightNum) &&
    heightNum >= 30 &&
    heightNum <= 300 &&
    (trimmedEmergencyPhone === '' || E164_PHONE_PATTERN.test(trimmedEmergencyPhone)) &&
    doctorName.trim().length <= 100 &&
    (trimmedDoctorPhone === '' || E164_PHONE_PATTERN.test(trimmedDoctorPhone));

  const handleSubmit = async () => {
    if (
      !isValid ||
      isSubmitting ||
      !gender ||
      !bloodType ||
      !allergyKnowledgeStatus ||
      !conditionKnowledgeStatus
    ) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dateOfBirth.trim(),
        weightKg: weightNum,
        heightCm: heightNum,
        gender,
        bloodType,
        allergyKnowledgeStatus,
        conditionKnowledgeStatus,
        emergencyContactPhone: trimmedEmergencyPhone || undefined,
        doctorName: doctorName.trim() || undefined,
        doctorPhone: trimmedDoctorPhone || undefined,
      });
    } catch {
      setError('Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.select({ ios: 'padding', default: undefined })}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>About you</Text>

        <Text style={[styles.label, { color: theme.textSecondary }]}>First name</Text>
        <TextInput
          value={firstName}
          onChangeText={setFirstName}
          placeholder="e.g. Sarah"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Last name</Text>
        <TextInput
          value={lastName}
          onChangeText={setLastName}
          placeholder="e.g. Al-Rashidi"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Date of birth (YYYY-MM-DD)</Text>
        <TextInput
          value={dateOfBirth}
          onChangeText={setDateOfBirth}
          placeholder="1978-03-15"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Gender</Text>
        <SegmentedPicker options={GENDER_OPTIONS} value={gender} labels={GENDER_LABEL} onChange={setGender} />

        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Health details</Text>

        <Text style={[styles.label, { color: theme.textSecondary }]}>Blood type</Text>
        <SegmentedPicker
          options={BLOOD_TYPE_OPTIONS}
          value={bloodType}
          labels={Object.fromEntries(BLOOD_TYPE_OPTIONS.map((option) => [option, option])) as Record<BloodType, string>}
          onChange={setBloodType}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Weight (kg)</Text>
        <TextInput
          value={weightKg}
          onChangeText={(value) => setWeightKg(value.replace(/[^0-9.]/g, ''))}
          placeholder="68"
          placeholderTextColor={theme.textSecondary}
          keyboardType="decimal-pad"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Height (cm)</Text>
        <TextInput
          value={heightCm}
          onChangeText={(value) => setHeightCm(value.replace(/[^0-9.]/g, ''))}
          placeholder="165"
          placeholderTextColor={theme.textSecondary}
          keyboardType="decimal-pad"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}
        />

        {recordsLoadFailed && (
          <Text style={[styles.errorText, { color: theme.danger }]}>
            Unable to load your current allergies and conditions. Please go back and try again.
          </Text>
        )}

        <Text style={[styles.label, { color: theme.textSecondary }]}>Known allergies</Text>
        <SegmentedPicker
          options={KNOWLEDGE_STATUS_OPTIONS}
          value={allergyKnowledgeStatus === 'unknown' ? 'none_known' : allergyKnowledgeStatus}
          labels={KNOWLEDGE_STATUS_LABEL}
          onChange={setAllergyKnowledgeStatus}
          disabledOptions={allergies.length > 0 ? ['none_known'] : []}
        />
        <RecordsPanel
          visible={allergyKnowledgeStatus === 'has_records'}
          isLoading={isLoadingRecords}
          items={allergies}
          emptyLabel="Nothing on file yet — add one below."
          addLabel="Add allergy"
          onAdd={() => setActiveModal('allergy')}
          renderItem={(allergy) => (
            <AllergyCard
              key={allergy.id}
              allergy={allergy}
              onDelete={() => setPendingDelete({ kind: 'allergy', id: allergy.id, name: allergy.name })}
            />
          )}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Known chronic conditions</Text>
        <SegmentedPicker
          options={KNOWLEDGE_STATUS_OPTIONS}
          value={conditionKnowledgeStatus === 'unknown' ? 'none_known' : conditionKnowledgeStatus}
          labels={KNOWLEDGE_STATUS_LABEL}
          onChange={setConditionKnowledgeStatus}
          disabledOptions={conditions.length > 0 ? ['none_known'] : []}
        />
        <RecordsPanel
          visible={conditionKnowledgeStatus === 'has_records'}
          isLoading={isLoadingRecords}
          items={conditions}
          emptyLabel="Nothing on file yet — add one below."
          addLabel="Add condition"
          onAdd={() => setActiveModal('condition')}
          renderItem={(condition) => (
            <ConditionCard
              key={condition.id}
              condition={condition}
              onDelete={() => setPendingDelete({ kind: 'condition', id: condition.id, name: condition.name })}
            />
          )}
        />

        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Emergency & care team</Text>

        <Text style={[styles.label, { color: theme.textSecondary }]}>Emergency contact phone (optional)</Text>
        <TextInput
          value={emergencyContactPhone}
          onChangeText={setEmergencyContactPhone}
          placeholder="+966501234567"
          placeholderTextColor={theme.textSecondary}
          keyboardType="phone-pad"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Doctor name (optional)</Text>
        <TextInput
          value={doctorName}
          onChangeText={setDoctorName}
          placeholder="e.g. Dr. Omar Khalil"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Doctor phone (optional)</Text>
        <TextInput
          value={doctorPhone}
          onChangeText={setDoctorPhone}
          placeholder="+966112345678"
          placeholderTextColor={theme.textSecondary}
          keyboardType="phone-pad"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}
        />

        {error && <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>}

        <TouchableOpacity
          activeOpacity={0.9}
          disabled={!isValid || isSubmitting}
          onPress={handleSubmit}
          style={[styles.submitButton, { backgroundColor: theme.primary, opacity: !isValid || isSubmitting ? 0.6 : 1 }]}
        >
          {isSubmitting ? (
            <ActivityIndicator color={theme.onPrimary} />
          ) : (
            <Text style={[styles.submitText, { color: theme.onPrimary }]}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <RecordFormModal
        visible={activeModal === 'allergy'}
        title="Add allergy"
        onClose={() => setActiveModal(null)}
      >
        <AllergyForm submitLabel="Add Allergy" onSubmit={handleAddAllergy} />
      </RecordFormModal>

      <RecordFormModal
        visible={activeModal === 'condition'}
        title="Add condition"
        onClose={() => setActiveModal(null)}
      >
        <ConditionForm submitLabel="Add Condition" onSubmit={handleAddCondition} />
      </RecordFormModal>

      <ConfirmDeleteModal
        visible={pendingDelete !== null}
        title={pendingDelete?.kind === 'allergy' ? 'Delete allergy?' : 'Delete condition?'}
        message={
          pendingDelete
            ? `Remove ${pendingDelete.name} from your ${
                pendingDelete.kind === 'allergy' ? 'allergies' : 'chronic conditions'
              }.`
            : ''
        }
        error={deleteError}
        isDeleting={isDeleting}
        onCancel={handleCancelDelete}
        onConfirm={() => void handleConfirmDelete()}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: Spacing.six },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginTop: Spacing.four,
    marginBottom: Spacing.one,
  },
  label: { fontSize: 13, fontWeight: '600', marginBottom: Spacing.one, marginTop: Spacing.three },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  segmentButton: {
    minWidth: 64,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  segmentText: { fontSize: 13, fontWeight: '700' },
  recordsPanel: { marginTop: Spacing.two },
  recordsList: { gap: Spacing.two },
  recordsLoading: { marginVertical: Spacing.two },
  recordsEmpty: { fontSize: 13, marginBottom: Spacing.two },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    marginTop: Spacing.two,
  },
  addText: { fontSize: 14, fontWeight: '700' },
  errorText: { fontSize: 13, marginTop: Spacing.three, textAlign: 'center' },
  submitButton: {
    marginTop: Spacing.five,
    minHeight: 54,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#173E2A',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  submitText: { fontSize: 16, fontWeight: '700' },
});
