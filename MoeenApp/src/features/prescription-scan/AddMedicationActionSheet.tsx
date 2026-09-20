import { Ionicons } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Radius, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onEnterManually: () => void;
  onScanPrescription: () => void;
};

export function AddMedicationActionSheet({
  visible,
  onClose,
  onEnterManually,
  onScanPrescription,
}: Props) {
  const theme = useTheme();

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close add medication options"
        onPress={onClose}
        style={styles.overlay}
      >
        <Pressable
          accessibilityRole="none"
          onPress={(event) => event.stopPropagation()}
          style={[styles.sheet, { backgroundColor: theme.backgroundElement }]}
        >
          <View
            style={[styles.handle, { backgroundColor: theme.backgroundSelected }]}
          />
          <Text style={[styles.title, { color: theme.text }]}>Add Medication</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Choose how you want to add your medication.</Text>

          <SheetOption
            icon="create-outline"
            label="Enter Manually"
            description="Search and enter medication details"
            onPress={onEnterManually}
          />
          <SheetOption
            icon="camera-outline"
            label="Scan Prescription"
            description="Take or upload a prescription photo"
            onPress={onScanPrescription}
          />

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onClose}
            style={[styles.cancel, { backgroundColor: theme.backgroundSelected }]}
          >
            <Text style={[styles.cancelText, { color: theme.text }]}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetOption({
  icon,
  label,
  description,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.82}
      onPress={onPress}
      style={[
        styles.option,
        {
          backgroundColor: theme.background,
          borderColor: theme.backgroundSelected,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: theme.primaryLight }]}>
        <Ionicons name={icon} size={22} color={theme.primary} />
      </View>
      <View style={styles.optionText}>
        <Text style={[styles.optionLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.optionDescription, { color: theme.textSecondary }]}>
          {description}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(18, 28, 22, 0.46)',
  },
  sheet: {
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 26,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
  },
  title: {
    ...Typography.pageTitle,
  },
  subtitle: {
    ...Typography.body,
    marginTop: 4,
    marginBottom: 18,
  },
  option: {
    minHeight: 76,
    borderWidth: 1,
    borderRadius: Radius.card,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#173E2A',
    shadowOpacity: 0.025,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  optionText: { flex: 1 },
  optionLabel: {
    ...Typography.bodyStrong,
    fontWeight: '700',
  },
  optionDescription: {
    ...Typography.caption,
    marginTop: 2,
  },
  cancel: {
    minHeight: 48,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  cancelText: {
    ...Typography.button,
  },
});
