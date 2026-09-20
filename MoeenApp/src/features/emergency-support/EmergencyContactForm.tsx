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

import { EmergencyContactsApiError } from './contacts-api';
import type {
  EmergencyContactInput,
  EmergencyContactRecord,
} from './contacts-types';
import {
  isValidE164,
  MAX_NAME_LENGTH,
  MAX_RELATIONSHIP_LENGTH,
} from './contacts-utils';

interface EmergencyContactFormProps {
  initialValues?: EmergencyContactRecord;
  submitLabel: string;
  onSubmit: (input: EmergencyContactInput) => Promise<void>;
}

export function EmergencyContactForm({
  initialValues,
  submitLabel,
  onSubmit,
}: EmergencyContactFormProps) {
  const theme = useTheme();

  const [name, setName] = useState(initialValues?.name ?? '');
  const [phone, setPhone] = useState(initialValues?.phone ?? '');
  const [relationship, setRelationship] = useState(
    initialValues?.relationship ?? '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const trimmedPhone = phone.trim();
  const trimmedRelationship = relationship.trim();

  const phoneInvalid = trimmedPhone.length > 0 && !isValidE164(trimmedPhone);

  const isValid =
    trimmedName.length > 0 &&
    trimmedName.length <= MAX_NAME_LENGTH &&
    isValidE164(trimmedPhone) &&
    trimmedRelationship.length <= MAX_RELATIONSHIP_LENGTH;

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: trimmedName,
        phone: trimmedPhone,
        relationship: trimmedRelationship || undefined,
      });
    } catch (err) {
      setError(
        err instanceof EmergencyContactsApiError
          ? err.message
          : 'Something went wrong. Please try again.',
      );
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.select({ ios: 'padding', default: undefined })}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <Text style={[styles.label, { color: theme.textSecondary }]}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Sarah Al-Rashidi"
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.backgroundElement,
              borderColor: theme.backgroundSelected,
            },
          ]}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Phone</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="+966501234567"
          placeholderTextColor={theme.textSecondary}
          keyboardType="phone-pad"
          autoCapitalize="none"
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.backgroundElement,
              borderColor: phoneInvalid ? theme.danger : theme.backgroundSelected,
            },
          ]}
        />
        {phoneInvalid && (
          <Text style={[styles.hint, { color: theme.danger }]}>
            Use international format, e.g. +966501234567.
          </Text>
        )}

        <Text style={[styles.label, { color: theme.textSecondary }]}>
          Relationship (optional)
        </Text>
        <TextInput
          value={relationship}
          onChangeText={setRelationship}
          placeholder="e.g. Sister"
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.backgroundElement,
              borderColor: theme.backgroundSelected,
            },
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
            <Text style={[styles.submitText, { color: theme.onPrimary }]}>
              {submitLabel}
            </Text>
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
  hint: { fontSize: 12, marginTop: Spacing.one },
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
