import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Radius, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface RecordFormModalProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function RecordFormModal({ visible, title, onClose, children }: RecordFormModalProps) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.select({ ios: 'padding', default: undefined })}
        >
          <View style={styles.spacer} />
          <View style={[styles.sheet, { backgroundColor: theme.background }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close"
                activeOpacity={0.8}
                onPress={onClose}
                style={[styles.closeButton, { backgroundColor: theme.backgroundElement }]}
              >
                <Ionicons name="close" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {children}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 28, 22, 0.46)',
  },
  spacer: { flex: 1 },
  sheet: {
    height: '85%',
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    ...Typography.pageTitle,
    fontSize: 19,
    lineHeight: 25,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
