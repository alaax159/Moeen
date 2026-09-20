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
  View,
} from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { searchAllergyTerms } from './api';
import { TermSearchInput } from './TermSearchInput';
import type { AllergyInput, AllergySeverity } from './types';
import { SEVERITY_LABEL, SEVERITY_OPTIONS } from './utils';

interface AllergyFormProps {
  initialValues?: AllergyInput;
  submitLabel: string;
  onSubmit: (input: AllergyInput) => Promise<void>;
}

export function AllergyForm({ initialValues, submitLabel, onSubmit }: AllergyFormProps) {
  const theme = useTheme();

  const [name, setName] = useState(initialValues?.name ?? '');
  const [externalId, setExternalId] = useState(initialValues?.externalId);
  const [severity, setSeverity] = useState<AllergySeverity>(initialValues?.severity ?? 'moderate');
  const [reaction, setReaction] = useState(initialValues?.reaction ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = name.trim().length > 0 && reaction.trim().length > 0;

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), externalId, severity, reaction: reaction.trim() });
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
        <Text style={[styles.label, { color: theme.textSecondary }]}>Allergy name</Text>
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
          search={searchAllergyTerms}
          placeholder="e.g. Penicillin"
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Severity</Text>
        <View style={styles.severityRow}>
          {SEVERITY_OPTIONS.map((option) => {
            const selected = option === severity;
            return (
              <TouchableOpacity
                key={option}
                activeOpacity={0.8}
                onPress={() => setSeverity(option)}
                style={[
                  styles.severityButton,
                  {
                    backgroundColor: selected ? theme.primary : theme.background,
                    borderColor: selected ? theme.primary : theme.backgroundSelected,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.severityText,
                    { color: selected ? theme.onPrimary : theme.textSecondary },
                  ]}
                >
                  {SEVERITY_LABEL[option]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: theme.textSecondary }]}>Reaction</Text>
        <TextInput
          value={reaction}
          onChangeText={setReaction}
          placeholder="e.g. Anaphylaxis"
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.input,
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
  severityRow: { flexDirection: 'row', gap: Spacing.two },
  severityButton: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  severityText: { fontSize: 13, fontWeight: '700' },
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
