import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import {
  addEmergencyContact,
  CONTACTS_GENERIC_ERROR,
  deleteEmergencyContact,
  EmergencyContactsApiError,
  getEmergencyContacts,
  setPrimaryEmergencyContact,
  updateEmergencyContact,
} from '@/features/emergency-support/contacts-api';
import type {
  EmergencyContactInput,
  EmergencyContactRecord,
} from '@/features/emergency-support/contacts-types';
import { sortContacts } from '@/features/emergency-support/contacts-utils';
import { EmergencyContactCard } from '@/features/emergency-support/EmergencyContactCard';
import { EmergencyContactForm } from '@/features/emergency-support/EmergencyContactForm';
import { ConfirmDeleteModal } from '@/features/health-profile/ConfirmDeleteModal';
import { FormScreenHeader } from '@/features/health-profile/FormScreenHeader';
import { RecordFormModal } from '@/features/health-profile/RecordFormModal';

type ActiveForm =
  | { mode: 'add' }
  | { mode: 'edit'; contact: EmergencyContactRecord }
  | null;

export default function EmergencyContactsScreen() {
  const theme = useTheme();

  const [contacts, setContacts] = useState<EmergencyContactRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const [pendingDelete, setPendingDelete] =
    useState<EmergencyContactRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Guards stale responses from clobbering fresher state. Every load captures
  // an incremented generation and only applies its result if still current;
  // every mutation that writes `contacts` locally bumps it so an in-flight GET
  // started earlier can't overwrite the mutation. Mirrors
  // ActiveInteractionsCard's requestGeneration pattern.
  const requestGeneration = useRef(0);

  const loadContacts = useCallback(async (refresh = false) => {
    const generation = ++requestGeneration.current;
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const data = sortContacts(await getEmergencyContacts());
      if (generation === requestGeneration.current) {
        setContacts(data);
      }
    } catch (err) {
      if (generation === requestGeneration.current) {
        setLoadError(
          err instanceof EmergencyContactsApiError
            ? err.message
            : CONTACTS_GENERIC_ERROR,
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadContacts();
      return () => {
        requestGeneration.current += 1;
      };
    }, [loadContacts]),
  );

  const handleAdd = async (input: EmergencyContactInput) => {
    const created = await addEmergencyContact(input);
    setContacts((prev) => sortContacts([...prev, created]));
    requestGeneration.current += 1;
    setActiveForm(null);
  };

  const handleEdit = async (input: EmergencyContactInput) => {
    if (activeForm?.mode !== 'edit') return;
    const updated = await updateEmergencyContact(activeForm.contact.id, input);
    setContacts((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c)),
    );
    requestGeneration.current += 1;
    setActiveForm(null);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || isDeleting) return;
    const { id, isPrimary } = pendingDelete;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteEmergencyContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      setPendingDelete(null);
      if (isPrimary) {
        // Deleting the primary promotes another contact server-side — refetch
        // (pull-to-refresh variant, list stays visible) so the new primary and
        // ordering come from the server, not a local guess. Safe now:
        // loadContacts bumps requestGeneration and is staleness-guarded.
        void loadContacts(true);
      } else {
        // Removing a non-primary contact changes nothing else; invalidate any
        // in-flight GET so it can't re-add the deleted row.
        requestGeneration.current += 1;
      }
    } catch (err) {
      // The 409 "only contact" case is expected and named — keep the dialog
      // open so the user reads why, rather than flashing a generic toast.
      setDeleteError(
        err instanceof EmergencyContactsApiError
          ? err.message
          : 'Unable to remove this contact. Please try again.',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSetPrimary = (contact: EmergencyContactRecord) => {
    const currentPrimary = contacts.find((c) => c.isPrimary);
    Alert.alert(
      'Set primary contact?',
      `${contact.name} will be reached first in an emergency${
        currentPrimary && currentPrimary.id !== contact.id
          ? `, replacing ${currentPrimary.name}`
          : ''
      }.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Set as primary',
          onPress: () => {
            void (async () => {
              try {
                const updated = await setPrimaryEmergencyContact(contact.id);
                setContacts((prev) =>
                  sortContacts(
                    prev.map((c) => ({ ...c, isPrimary: c.id === updated.id })),
                  ),
                );
                requestGeneration.current += 1;
              } catch (err) {
                Alert.alert(
                  'Unable to set primary contact',
                  err instanceof EmergencyContactsApiError
                    ? err.message
                    : 'Please try again.',
                );
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <ThemedView
      style={[styles.screen, { backgroundColor: theme.backgroundElement }]}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadContacts(true)}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
        >
          <FormScreenHeader title="Emergency Contacts" />

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                Loading your contacts...
              </Text>
            </View>
          ) : loadError ? (
            <View style={[styles.stateCard, { backgroundColor: theme.background }]}>
              <Ionicons
                name="alert-circle-outline"
                size={30}
                color={theme.danger}
              />
              <Text style={[styles.stateTitle, { color: theme.text }]}>
                Couldn&apos;t load your contacts
              </Text>
              <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                {loadError}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void loadContacts()}
                style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              >
                <Text style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : contacts.length === 0 ? (
            <View style={[styles.stateCard, { backgroundColor: theme.background }]}>
              <Ionicons name="people-outline" size={30} color={theme.primary} />
              <Text style={[styles.stateTitle, { color: theme.text }]}>
                No emergency contacts yet
              </Text>
              <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                Add the people who should be reached if you can&apos;t respond.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setActiveForm({ mode: 'add' })}
                style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              >
                <Text style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
                  Add contact
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
                YOUR CONTACTS
              </Text>

              <View style={styles.list}>
                {contacts.map((contact) => (
                  <EmergencyContactCard
                    key={contact.id}
                    contact={contact}
                    onEdit={() => setActiveForm({ mode: 'edit', contact })}
                    onDelete={() => {
                      setDeleteError(null);
                      setPendingDelete(contact);
                    }}
                    onSetPrimary={() => handleSetPrimary(contact)}
                  />
                ))}
              </View>

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Add contact"
                activeOpacity={0.8}
                onPress={() => setActiveForm({ mode: 'add' })}
                style={styles.addButton}
              >
                <Ionicons name="add" size={16} color={theme.primary} />
                <Text style={[styles.addText, { color: theme.primary }]}>
                  Add contact
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <RecordFormModal
        visible={activeForm !== null}
        title={activeForm?.mode === 'edit' ? 'Edit contact' : 'Add contact'}
        onClose={() => setActiveForm(null)}
      >
        {activeForm?.mode === 'edit' ? (
          <EmergencyContactForm
            key={activeForm.contact.id}
            initialValues={activeForm.contact}
            submitLabel="Save Changes"
            onSubmit={handleEdit}
          />
        ) : (
          <EmergencyContactForm
            key="add"
            submitLabel="Add Contact"
            onSubmit={handleAdd}
          />
        )}
      </RecordFormModal>

      <ConfirmDeleteModal
        visible={pendingDelete !== null}
        title="Delete contact?"
        message={
          pendingDelete
            ? `Remove ${pendingDelete.name} from your emergency contacts.`
            : ''
        }
        error={deleteError}
        isDeleting={isDeleting}
        onCancel={() => {
          setPendingDelete(null);
          setDeleteError(null);
        }}
        onConfirm={() => void handleConfirmDelete()}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 124 },
  centerState: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.six,
  },
  stateCard: {
    alignItems: 'center',
    borderRadius: 22,
    gap: Spacing.two,
    padding: Spacing.four,
  },
  stateTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  stateText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  primaryButton: {
    borderRadius: 12,
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: 12,
  },
  primaryButtonText: { fontSize: 14, fontWeight: '700' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginBottom: Spacing.two,
  },
  list: { gap: Spacing.two },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    marginTop: Spacing.three,
  },
  addText: { fontSize: 14, fontWeight: '700' },
});
