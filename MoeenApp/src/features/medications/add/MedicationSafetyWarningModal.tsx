import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Radius, Spacing, Typography } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

import type { MedicationSafetyWarning } from "./api";

interface MedicationSafetyWarningModalProps {
  visible: boolean;
  warnings: MedicationSafetyWarning[];
  isSaving?: boolean;
  onGoBack: () => void;
  onContinueAnyway: () => void;
}

const SEVERITY_LABEL: Record<string, string> = {
  contraindicated: "Contraindicated",
  major: "Major",
  high: "High",
  moderate: "Moderate",
  medium: "Medium",
  minor: "Minor",
  low: "Low",
  unknown: "Unverified",
};

// drug_drug has no single category label — it's a conflict between two
// medications, not about one named allergy/condition, so it falls back to
// just the severity pill (no heading, no "Affected:" line).
const WARNING_TYPE_LABEL: Partial<
  Record<MedicationSafetyWarning["warningType"], string>
> = {
  drug_allergy: "Allergy conflict",
  drug_condition: "Condition caution",
};

export function MedicationSafetyWarningModal({
  visible,
  warnings,
  isSaving = false,
  onGoBack,
  onContinueAnyway,
}: MedicationSafetyWarningModalProps) {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onGoBack}
    >
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.background }]}>
          <View style={styles.header}>
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: theme.warningLight },
              ]}
            >
              <Ionicons name="warning" size={22} color={theme.warning} />
            </View>
            <Text style={[styles.title, { color: theme.text }]}>
              Medication safety warning
            </Text>
          </View>

          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Review these findings before saving. Nothing has been added yet.
          </Text>

          <ScrollView
            style={styles.warningList}
            showsVerticalScrollIndicator={false}
          >
            {warnings.map((warning, index) => {
              const severityKey = warning.severity.toLowerCase();
              const isSevere =
                severityKey === "contraindicated" ||
                severityKey === "major" ||
                severityKey === "high";
              const accentColor = isSevere ? theme.danger : theme.warning;
              const accentBg = isSevere
                ? theme.dangerLight
                : theme.warningLight;
              const categoryLabel = WARNING_TYPE_LABEL[warning.warningType];

              const severityPill = (
                <View
                  style={[styles.severityPill, { backgroundColor: accentBg }]}
                >
                  <Text style={[styles.severityText, { color: accentColor }]}>
                    {SEVERITY_LABEL[severityKey] ?? warning.severity}
                  </Text>
                </View>
              );

              return (
                <View
                  key={`${warning.warningType}-${index}`}
                  style={[
                    styles.warningRow,
                    { backgroundColor: theme.backgroundElement },
                  ]}
                >
                  {categoryLabel ? (
                    <View style={styles.warningHeaderRow}>
                      <Text
                        style={[
                          styles.categoryLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {categoryLabel}
                      </Text>
                      {severityPill}
                    </View>
                  ) : (
                    <View style={styles.severityPillWrap}>{severityPill}</View>
                  )}

                  {warning.affected && (
                    <View style={styles.affectedRow}>
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color={theme.textSecondary}
                      />
                      <Text
                        style={[
                          styles.affectedText,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Affected: {warning.affected}
                      </Text>
                    </View>
                  )}

                  <Text style={[styles.warningMessage, { color: theme.text }]}>
                    {warning.message}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: isSaving }}
              activeOpacity={0.8}
              disabled={isSaving}
              onPress={onGoBack}
              style={[
                styles.button,
                {
                  backgroundColor: theme.backgroundElement,
                  opacity: isSaving ? 0.5 : 1,
                },
              ]}
            >
              <Text style={[styles.buttonText, { color: theme.text }]}>
                Go back
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: isSaving }}
              activeOpacity={0.8}
              disabled={isSaving}
              onPress={onContinueAnyway}
              style={[
                styles.button,
                { backgroundColor: theme.danger, opacity: isSaving ? 0.5 : 1 },
              ]}
            >
              <Text style={[styles.buttonText, { color: theme.onPrimary }]}>
                {isSaving ? "Saving..." : "Continue anyway"}
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
    maxWidth: 380,
    maxHeight: '80%',
    borderRadius: Radius.large,
    padding: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...Typography.pageTitle,
    fontSize: 19,
    lineHeight: 25,
    flexShrink: 1,
  },
  subtitle: {
    ...Typography.caption,
    marginBottom: 14,
  },
  warningList: {
    marginBottom: 20,
  },
  warningRow: {
    borderRadius: Radius.card,
    padding: 14,
    marginBottom: 10,
  },
  warningHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  categoryLabel: {
    ...Typography.caption,
    fontWeight: '600',
    flexShrink: 1,
  },
  severityPillWrap: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  severityPill: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  severityText: {
    ...Typography.badge,
    fontSize: 10,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  affectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  affectedText: {
    ...Typography.label,
  },
  warningMessage: {
    ...Typography.body,
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
