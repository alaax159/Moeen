import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Radius, Spacing, Typography } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

import type { DuplicateMedication } from "./api";

interface DuplicateMedicationWarningModalProps {
  visible: boolean;
  duplicateMedication: DuplicateMedication | null;
  onGoBack: () => void;
  onContinueAnyway: () => void;
}

export function DuplicateMedicationWarningModal({
  visible,
  duplicateMedication,
  onGoBack,
  onContinueAnyway,
}: DuplicateMedicationWarningModalProps) {
  const theme = useTheme();

  const medicationName = duplicateMedication?.name || "This medication";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onGoBack}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.background,
            },
          ]}
        >
          <View style={styles.header}>
            <View
              style={[
                styles.iconBadge,
                {
                  backgroundColor: theme.warningLight,
                },
              ]}
            >
              <Ionicons
                name="warning-outline"
                size={24}
                color={theme.warning}
              />
            </View>

            <Text
              style={[
                styles.title,
                {
                  color: theme.text,
                },
              ]}
            >
              Medication already active
            </Text>
          </View>

          <Text
            style={[
              styles.message,
              {
                color: theme.textSecondary,
              },
            ]}
          >
            {medicationName} is already in your active medications. Adding it
            again may create a duplicate medication entry.
          </Text>

          <Text
            style={[
              styles.question,
              {
                color: theme.text,
              },
            ]}
          >
            Do you still want to add it?
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={onGoBack}
              style={[
                styles.button,
                {
                  backgroundColor: theme.backgroundElement,
                },
              ]}
            >
              <Text
                style={[
                  styles.buttonText,
                  {
                    color: theme.text,
                  },
                ]}
              >
                Go Back
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Add medication anyway"
              onPress={onContinueAnyway}
              style={[
                styles.button,
                {
                  backgroundColor: theme.warning,
                },
              ]}
            >
              <Text
                style={[
                  styles.buttonText,
                  {
                    color: theme.background,
                  },
                ]}
              >
                Add Anyway
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
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    borderRadius: Radius.large,
    padding: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...Typography.pageTitle,
    fontSize: 19,
    lineHeight: 25,
    flex: 1,
  },
  message: {
    ...Typography.body,
    marginBottom: 14,
  },
  question: {
    ...Typography.bodyStrong,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  button: {
    minHeight: 46,
    borderRadius: Radius.control,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    ...Typography.button,
  },
});
