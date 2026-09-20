import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Spacing } from "@/constants/theme";
import type { UserMedicationSummary } from "@/features/medications/list/types";
import { useTheme } from "@/hooks/use-theme";

import { EmergencyHelpButton } from "./EmergencyHelpButton";
import {
  EscalationReportError,
  type EscalationDoseHistoryEntry,
} from "./escalation-report";

interface EscalateDirectiveBannerProps {
  /** Fixed directive copy, decided upstream. Rendered verbatim — never built here. */
  directiveText: string;
  /** The screen's current medications, shown as context for what will be shared. */
  medications: UserMedicationSummary[];
  /** Recent dose history from GET /escalation/export, shown as context. */
  doseHistory: EscalationDoseHistoryEntry[];
  /**
   * Performs the whole share flow (fetch export, render PDF client-side, open
   * the share sheet). `shareEscalationReportWithProvider` from
   * ./escalation-report is the implementation the host passes in.
   */
  onShareWithProvider: () => Promise<void>;
}

type ShareOperation = "sharing" | null;

interface Feedback {
  kind: "success" | "error";
  message: string;
}

function feedbackForError(error: unknown): Feedback {
  if (error instanceof EscalationReportError) {
    return { kind: "error", message: error.message };
  }

  return {
    kind: "error",
    message: "Unable to share the provider summary. Please try again.",
  };
}

function inclusionSummary(
  medicationCount: number,
  doseCount: number,
): string {
  const medications =
    medicationCount === 1 ? "1 current medication" : `${medicationCount} current medications`;
  const doses =
    doseCount === 1 ? "1 recent dose" : `${doseCount} recent doses`;

  return `Includes ${medications} and ${doses}.`;
}

/**
 * Directive banner for the "serious reaction detected" escalation. Wired into
 * the chat screen (src/app/(tabs)/chat.tsx) but only rendered when a chat
 * response carries an `escalation` field — which the backend never emits today
 * (its threshold stays null). `onShareWithProvider` is a required prop;
 * `shareEscalationReportWithProvider` (./escalation-report) is the host's impl.
 */
export function EscalateDirectiveBanner({
  directiveText,
  medications,
  doseHistory,
  onShareWithProvider,
}: EscalateDirectiveBannerProps) {
  const theme = useTheme();

  const [operation, setOperation] = useState<ShareOperation>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const mountedRef = useRef(true);
  const isBusy = operation !== null;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleShare() {
    if (isBusy) {
      return;
    }

    setOperation("sharing");
    setFeedback(null);

    try {
      await onShareWithProvider();

      if (!mountedRef.current) {
        return;
      }

      setFeedback({
        kind: "success",
        message: "The provider summary is ready in the share menu.",
      });
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      setFeedback(feedbackForError(error));
    } finally {
      if (mountedRef.current) {
        setOperation(null);
      }
    }
  }

  const feedbackBackground =
    feedback?.kind === "error" ? theme.dangerLight : theme.primaryLight;
  const feedbackColor =
    feedback?.kind === "error" ? theme.danger : theme.primary;
  const feedbackIcon =
    feedback?.kind === "error"
      ? "alert-circle-outline"
      : "checkmark-circle-outline";

  return (
    <View style={[styles.card, { backgroundColor: theme.dangerLight }]}>
      <View style={styles.headerRow}>
        <Ionicons name="warning" size={22} color={theme.danger} />
        <Text style={[styles.directive, { color: theme.text }]}>
          {directiveText}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share a summary with a provider"
        accessibilityState={{ disabled: isBusy }}
        disabled={isBusy}
        onPress={() => {
          void handleShare();
        }}
        style={({ pressed }) => [
          styles.shareButton,
          {
            backgroundColor: theme.danger,
            opacity: isBusy ? 0.55 : pressed ? 0.82 : 1,
          },
        ]}
      >
        {operation === "sharing" ? (
          <ActivityIndicator size="small" color={theme.onPrimary} />
        ) : (
          <Ionicons
            name="share-social-outline"
            size={19}
            color={theme.onPrimary}
          />
        )}
        <Text style={[styles.shareButtonText, { color: theme.onPrimary }]}>
          {operation === "sharing" ? "Opening..." : "Share with a provider"}
        </Text>
      </Pressable>

      <Text style={[styles.inclusion, { color: theme.textSecondary }]}>
        {inclusionSummary(medications.length, doseHistory.length)}
      </Text>

      {feedback ? (
        <View
          accessibilityRole={feedback.kind === "error" ? "alert" : undefined}
          accessible
          accessibilityLabel={feedback.message}
          style={[styles.feedback, { backgroundColor: feedbackBackground }]}
        >
          <Ionicons name={feedbackIcon} size={18} color={feedbackColor} />
          <Text style={[styles.feedbackText, { color: feedbackColor }]}>
            {feedback.message}
          </Text>
        </View>
      ) : null}

      <EmergencyHelpButton style={styles.help} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    gap: Spacing.three,
    padding: Spacing.three,
  },
  headerRow: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  directive: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  shareButton: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: Spacing.two,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: Spacing.three,
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: "800",
  },
  inclusion: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: -Spacing.two,
  },
  feedback: {
    alignItems: "flex-start",
    borderRadius: 12,
    flexDirection: "row",
    gap: Spacing.two,
    padding: Spacing.two,
  },
  feedbackText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  help: {
    marginTop: Spacing.half,
  },
});
