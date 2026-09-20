import { Ionicons } from '@expo/vector-icons';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import type { EmergencyContactRecord } from './contacts-types';
import {
  EMERGENCY_SERVICES_NUMBER,
  getPrimaryEmergencyContact,
  openDialer,
} from './emergency-help';

interface EmergencyHelpButtonProps {
  style?: StyleProp<ViewStyle>;
}

/**
 * State of the eager primary-contact fetch:
 * - `loading` / `failed` → press shows emergency-services only; the
 *   call-services path must never wait on or depend on this fetch.
 * - `ready` → confirmed fresh (`contact: null` means the user has none saved).
 * - `stale` → a refresh failed after a prior success, so we keep the last
 *   known contact but flag it "(unverified)" on press — it may have changed or
 *   been deleted since we last confirmed it.
 */
type PrimaryContactState =
  | { status: 'loading' }
  | { status: 'ready'; contact: EmergencyContactRecord | null }
  | { status: 'stale'; contact: EmergencyContactRecord }
  | { status: 'failed' };

export function EmergencyHelpButton({ style }: EmergencyHelpButtonProps) {
  const theme = useTheme();
  const router = useRouter();
  const [contactState, setContactState] = useState<PrimaryContactState>({
    status: 'loading',
  });

  // Fetch the primary contact eagerly whenever this button's screen is
  // focused (which includes first render), and cache it in state. The press
  // handler then never touches the network.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      void (async () => {
        try {
          const contact = await getPrimaryEmergencyContact();
          if (!cancelled) {
            setContactState({ status: 'ready', contact });
          }
        } catch {
          // Offline, expired session, server error — the emergency-services
          // path must not depend on this call succeeding.
          if (!cancelled) {
            setContactState((prev) => {
              // A refresh failure after a prior success with a real contact:
              // keep it, but mark it unverified rather than dropping it (a
              // cached `tel:` still works offline) or pretending it's fresh.
              if (prev.status === 'ready' && prev.contact) {
                return { status: 'stale', contact: prev.contact };
              }
              if (prev.status === 'stale') {
                return prev;
              }
              // First-ever load, or a prior success that had no contact to
              // preserve — nothing to carry over.
              return { status: 'failed' };
            });
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, []),
  );

  const handlePress = () => {
    const callServices = {
      text: `Call emergency services (${EMERGENCY_SERVICES_NUMBER})`,
      onPress: () => {
        void openDialer(EMERGENCY_SERVICES_NUMBER);
      },
    };
    const cancel = { text: 'Cancel', style: 'cancel' as const };

    const promptWhoToCall = (
      contact: EmergencyContactRecord,
      unverified: boolean,
    ) => {
      Alert.alert('Emergency Help', 'Who would you like to call?', [
        callServices,
        {
          text: unverified
            ? `Call ${contact.name} (unverified)`
            : `Call ${contact.name}`,
          onPress: () => {
            void openDialer(contact.phone);
          },
        },
        cancel,
      ]);
    };

    // No usable contact info (still loading, or the fetch failed with nothing
    // cached): show the emergency-services-only alert immediately — don't make
    // the user wait; a native Alert can't be updated once shown.
    if (
      contactState.status === 'loading' ||
      contactState.status === 'failed'
    ) {
      Alert.alert(
        'Emergency Help',
        "We couldn't load your saved contacts. You can still call emergency services.",
        [callServices, cancel],
      );
      return;
    }

    // `stale`: a refresh failed after a prior success — still offer the contact,
    // flagged unverified so the user knows it wasn't just confirmed.
    if (contactState.status === 'stale') {
      promptWhoToCall(contactState.contact, true);
      return;
    }

    // `ready`: confirmed fresh.
    const { contact } = contactState;

    if (contact) {
      promptWhoToCall(contact, false);
      return;
    }

    Alert.alert(
      'Emergency Help',
      'You have no emergency contacts saved yet. Add one so you can reach them in a tap.',
      [
        callServices,
        {
          text: 'Add a contact',
          onPress: () => router.push('/profile/emergency-contacts' as Href),
        },
        cancel,
      ],
    );
  };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Emergency help"
      accessibilityHint="Choose to call emergency services or your primary contact"
      activeOpacity={0.85}
      onPress={handlePress}
      style={[styles.button, { backgroundColor: theme.danger }, style]}
    >
      <View style={[styles.iconWrap, { backgroundColor: theme.onPrimary }]}>
        <Ionicons name="medical" size={20} color={theme.danger} />
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: theme.onPrimary }]}>
          Emergency Help
        </Text>
        <Text style={[styles.subtitle, { color: theme.onPrimary }]}>
          Call {EMERGENCY_SERVICES_NUMBER} or your primary contact
        </Text>
      </View>
      <Ionicons name="call" size={20} color={theme.onPrimary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    padding: 14,
    minHeight: 66,
    shadowColor: '#8A2F2F',
    shadowOpacity: 0.05,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: { fontSize: 16, fontWeight: '800' },
  subtitle: { fontSize: 12, fontWeight: '600', marginTop: 2, opacity: 0.9 },
});
