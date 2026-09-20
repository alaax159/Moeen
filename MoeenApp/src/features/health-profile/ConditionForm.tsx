import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { searchChronicConditionTerms } from './api';
import { TermSearchInput } from './TermSearchInput';
import type { ChronicConditionInput } from './types';
import { DATE_PATTERN, isFutureDate } from './utils';

interface ConditionFormProps {
  initialValues?: ChronicConditionInput;
  submitLabel: string;
  onSubmit: (input: ChronicConditionInput) => Promise<void>;
}

export function ConditionForm({ initialValues, submitLabel, onSubmit }: ConditionFormProps) {
  const theme = useTheme();

  const [name, setName] = useState(initialValues?.name ?? '');
  const [externalId, setExternalId] = useState(initialValues?.externalId);
  const [diagnosisDate, setDiagnosisDate] = useState(initialValues?.diagnosisDate ?? '');
  const [notes, setNotes] = useState(initialValues?.notes ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid =
    name.trim().length > 0 &&
    DATE_PATTERN.test(diagnosisDate.trim()) &&
    !isFutureDate(diagnosisDate.trim());

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        externalId,
        diagnosisDate: diagnosisDate.trim(),
        notes: notes.trim() || undefined,
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
        <Text style={[styles.label, { color: theme.textSecondary }]}>Condition name</Text>
        <TermSearchInput
          value={name}
          onChangeText={(text) => {
            setName(text);
            setExternalId(undefined);
          }}
          onSelect={(term) => {
            setName(term.name);
            setExternalId(term.externalId);
          }}
          search={searchChronicConditionTerms}
          placeholder="e.g. Type 2 Diabetes"
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Diagnosis date (YYYY-MM-DD)</Text>
        <TextInput
          value={diagnosisDate}
          onChangeText={setDiagnosisDate}
          placeholder="2019-06-01"
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected },
          ]}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Notes (optional)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. Managed with metformin"
          placeholderTextColor={theme.textSecondary}
          multiline
          numberOfLines={3}
          style={[
            styles.input,
            styles.notesInput,
            { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected },
          ]}
        />

        {error && <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>}

        <TouchableOpacity
          activeOpacity={0.9}
          disabled={!isValid || isSubmitting}
          onPress={handleSubmit}
          style={[
            styles.submitButton,
            { backgroundColor: theme.primary, opacity: !isValid || isSubmitting ? 0.6 : 1 },
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color={theme.onPrimary} />
          ) : (
            <Text style={[styles.submitText, { color: theme.onPrimary }]}>{submitLabel}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: Spacing.six },
  label: { fontSize: 13, fontWeight: '600', marginBottom: Spacing.one, marginTop: Spacing.three },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
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
