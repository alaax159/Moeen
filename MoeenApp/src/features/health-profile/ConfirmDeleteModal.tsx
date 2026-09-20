import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const CONFIRM_DELAY_SECONDS = 5;

interface ConfirmDeleteModalProps {
  visible: boolean;
  title: string;
  message: string;
  error?: string | null;
  isDeleting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDeleteModal({
  visible,
  title,
  message,
  error,
  isDeleting = false,
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) {
  const theme = useTheme();
  const [secondsLeft, setSecondsLeft] = useState(CONFIRM_DELAY_SECONDS);
  const [wasVisible, setWasVisible] = useState(visible);

  // Reset the countdown each time the modal opens. Adjusting state during
  // render (rather than in an effect) here is the recommended way to reset
  // state in response to a prop change — see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setSecondsLeft(CONFIRM_DELAY_SECONDS);
    }
  }

  useEffect(() => {
    if (!visible) {
      return;
    }

    const intervalId = setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearInterval(intervalId);
  }, [visible]);

  const canConfirm = secondsLeft === 0 && !isDeleting;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.background }]}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.message, { color: theme.textSecondary }]}>
            {message}
          </Text>

          {error && (
            <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: isDeleting }}
              activeOpacity={0.8}
              disabled={isDeleting}
              onPress={onCancel}
              style={[
                styles.button,
                { backgroundColor: theme.backgroundElement, opacity: isDeleting ? 0.5 : 1 },
              ]}
            >
              <Text style={[styles.buttonText, { color: theme.text }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: !canConfirm }}
              activeOpacity={0.8}
              disabled={!canConfirm}
              onPress={onConfirm}
              style={[
                styles.button,
                { backgroundColor: theme.danger, opacity: canConfirm ? 1 : 0.5 },
              ]}
            >
              <Text style={[styles.buttonText, { color: theme.onPrimary }]}>
                {isDeleting
                  ? 'Deleting…'
                  : canConfirm
                    ? 'Delete'
                    : `Delete (${secondsLeft})`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 28, 22, 0.46)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius.large,
    padding: 22,
  },
  title: {
    ...Typography.pageTitle,
    fontSize: 19,
    lineHeight: 25,
    marginBottom: 8,
  },
  message: {
    ...Typography.body,
    marginBottom: 20,
  },
  error: {
    ...Typography.caption,
    marginBottom: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  button: {
    minWidth: 96,
    minHeight: 46,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: {
    ...Typography.button,
  },
});
