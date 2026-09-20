import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

import { Radius, Typography } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  getUserMedications,
  MedicationsListApiError,
} from "@/features/medications/list/api";
import type { UserMedicationSummary } from "@/features/medications/list/types";

import {
  ChatApiError,
  createChatRequestId,
  getChatCitation,
  streamChatMessage,
} from "@/features/chat/api";
import {
  applyAssistantDelta,
  failAssistantDelivery,
} from "@/features/chat/chat-state";
import {
  beginLatestRequest,
  isLatestRequest,
} from "@/features/chat/request-generation";
import type {
  AssistantDeliveryStatus,
  ChatCitation,
  ChatDoneEvent,
  ChatEscalation,
  ChatValidationStatus,
} from "@/features/chat/types";
import { EscalateDirectiveBanner } from "@/features/emergency-support/EscalateDirectiveBanner";
import {
  getEscalationExport,
  shareEscalationReportWithProvider,
  type EscalationDoseHistoryEntry,
} from "@/features/emergency-support/escalation-report";

interface ChatUiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  status: AssistantDeliveryStatus;
  citations: string[];
  error?: string;
  requestId?: string;
  originalMessage?: string;
  subjectMedicationId?: number;
  validationStatus?: ChatValidationStatus;
  promptVersion?: string;
  escalation?: ChatEscalation | null;
}

interface RunTurnInput {
  assistantId: string;
  requestId: string;
  userText: string;
  subjectMedicationId: number;
  retry: boolean;
}

function medicationName(medication: UserMedicationSummary): string {
  return medication.brandName || medication.genericName || "Medication";
}

function formatSection(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function ChatScreen() {
  const theme = useTheme();

  const [medications, setMedications] = useState<UserMedicationSummary[]>([]);
  const [selectedMedicationId, setSelectedMedicationId] = useState<
    number | null
  >(null);
  const [isLoadingMedications, setIsLoadingMedications] = useState(true);
  const [medicationError, setMedicationError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isSending, setIsSending] = useState(false);

  const [citationCache, setCitationCache] = useState<
    Record<string, ChatCitation>
  >({});
  const [citationModalVisible, setCitationModalVisible] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<ChatCitation | null>(
    null,
  );
  const [citationTargetId, setCitationTargetId] = useState<string | null>(null);
  const [citationLoading, setCitationLoading] = useState(false);
  const [citationError, setCitationError] = useState<string | null>(null);

  // Per-message dose history for an escalation banner, from GET /escalation/export.
  // Only ever populated if a chat response carries `escalation` — which the
  // backend does not send today (its threshold stays null).
  const [escalationExports, setEscalationExports] = useState<
    Record<string, EscalationDoseHistoryEntry[]>
  >({});
  const escalationFetchesRef = useRef<Set<string>>(new Set());

  const scrollRef = useRef<ScrollView>(null);
  const citationRequestGenerationRef = useRef({
    generation: 0,
  });

  const loadMedications = useCallback(async () => {
    setIsLoadingMedications(true);
    setMedicationError(null);

    try {
      const result = await getUserMedications("active");

      const eligible = result.filter(
        (medication) =>
          medication.status === "active" && medication.completion === "ongoing",
      );

      setMedications(eligible);

      setSelectedMedicationId((current) => {
        if (
          current !== null &&
          eligible.some((medication) => medication.id === current)
        ) {
          return current;
        }

        return eligible[0]?.id ?? null;
      });
    } catch (error) {
      setMedicationError(
        error instanceof MedicationsListApiError
          ? error.message
          : "Unable to load your medications.",
      );
    } finally {
      setIsLoadingMedications(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadMedications();
    }, [loadMedications]),
  );

  useEffect(() => {
    scrollRef.current?.scrollToEnd({
      animated: true,
    });
  }, [messages]);

  // Fetch the provider-summary dose history once per assistant message that
  // carries an escalation directive. Unreachable in production today (the
  // backend never sets `escalation`), but the fetch/render path is real.
  useEffect(() => {
    const pending = messages.filter(
      (message) =>
        message.role === "assistant" &&
        message.escalation != null &&
        !escalationFetchesRef.current.has(message.id),
    );

    for (const message of pending) {
      escalationFetchesRef.current.add(message.id);

      void getEscalationExport()
        .then((exportResult) => {
          setEscalationExports((current) => ({
            ...current,
            [message.id]: exportResult.recentDoses,
          }));
        })
        .catch(() => {
          // The banner still renders with an empty dose list; its own
          // "Share with a provider" action surfaces any real failure.
          escalationFetchesRef.current.delete(message.id);
        });
    }
  }, [messages]);

  const selectedMedication = useMemo(
    () =>
      medications.find(
        (medication) => medication.id === selectedMedicationId,
      ) ?? null,
    [medications, selectedMedicationId],
  );

  const updateAssistant = useCallback(
    (
      assistantId: string,
      updater: (message: ChatUiMessage) => ChatUiMessage,
    ) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? updater(message) : message,
        ),
      );
    },
    [],
  );

  const runTurn = useCallback(
    async ({
      assistantId,
      requestId,
      userText,
      subjectMedicationId,
      retry,
    }: RunTurnInput) => {
      setIsSending(true);

      let replaceOnNextDelta = retry;

      if (retry) {
        updateAssistant(assistantId, (message) => ({
          ...message,
          status: "streaming",
          error: undefined,
        }));
      }

      try {
        await streamChatMessage(
          {
            requestId,
            message: userText,
            ...(sessionId !== null ? { sessionId } : {}),
            subjectMedicationId,
          },
          {
            onSession: (nextSessionId) => {
              setSessionId(nextSessionId);
            },

            onDelta: (text) => {
              const replace = replaceOnNextDelta;

              replaceOnNextDelta = false;

              updateAssistant(assistantId, (message) => {
                const delivery = applyAssistantDelta(
                  {
                    text: message.text,
                    status: message.status,
                    error: message.error,
                  },
                  text,
                  replace,
                );

                return {
                  ...message,
                  ...delivery,
                };
              });
            },

            onDone: (done: ChatDoneEvent) => {
              updateAssistant(assistantId, (message) => ({
                ...message,
                status: "complete",
                error: undefined,
                citations: done.citations,
                validationStatus: done.validationStatus,
                promptVersion: done.promptVersion,
                escalation: done.escalation ?? null,
              }));
            },
          },
        );
      } catch (error) {
        const message =
          error instanceof ChatApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "The connection was interrupted.";

        updateAssistant(assistantId, (current) => {
          const delivery = failAssistantDelivery(
            {
              text: current.text,
              status: current.status,
              error: current.error,
            },
            message,
          );

          return {
            ...current,
            ...delivery,
          };
        });
      } finally {
        setIsSending(false);
      }
    },
    [sessionId, updateAssistant],
  );

  const handleSend = useCallback(() => {
    const userText = input.trim();

    if (!userText || selectedMedicationId === null || isSending) {
      return;
    }

    const requestId = createChatRequestId();

    const userId = `${requestId}:user`;
    const assistantId = `${requestId}:assistant`;

    const userMessage: ChatUiMessage = {
      id: userId,
      role: "user",
      text: userText,
      status: "complete",
      citations: [],
    };

    const assistantMessage: ChatUiMessage = {
      id: assistantId,
      role: "assistant",
      text: "",
      status: "streaming",
      citations: [],
      requestId,
      originalMessage: userText,
      subjectMedicationId: selectedMedicationId,
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);

    setInput("");

    void runTurn({
      assistantId,
      requestId,
      userText,
      subjectMedicationId: selectedMedicationId,
      retry: false,
    });
  }, [input, isSending, runTurn, selectedMedicationId]);

  const handleRetry = useCallback(
    (message: ChatUiMessage) => {
      if (
        isSending ||
        !message.requestId ||
        !message.originalMessage ||
        !message.subjectMedicationId
      ) {
        return;
      }

      void runTurn({
        assistantId: message.id,
        requestId: message.requestId,
        userText: message.originalMessage,
        subjectMedicationId: message.subjectMedicationId,
        retry: true,
      });
    },
    [isSending, runTurn],
  );

  const startNewChat = useCallback(() => {
    if (isSending) {
      return;
    }

    setMessages([]);
    setSessionId(null);
    setInput("");
  }, [isSending]);

  const loadCitation = useCallback(
    async (citationId: string) => {
      const requestGeneration = beginLatestRequest(
        citationRequestGenerationRef.current,
      );

      setCitationTargetId(citationId);
      setCitationModalVisible(true);
      setCitationError(null);

      const cached = citationCache[citationId];

      if (cached) {
        setSelectedCitation(cached);
        setCitationLoading(false);
        return;
      }

      setSelectedCitation(null);
      setCitationLoading(true);

      try {
        const citation = await getChatCitation(citationId);

        setCitationCache((current) => ({
          ...current,
          [citationId]: citation,
        }));

        if (
          !isLatestRequest(
            citationRequestGenerationRef.current,
            requestGeneration,
          )
        ) {
          return;
        }

        setSelectedCitation(citation);
      } catch (error) {
        if (
          !isLatestRequest(
            citationRequestGenerationRef.current,
            requestGeneration,
          )
        ) {
          return;
        }

        setCitationError(
          error instanceof Error
            ? error.message
            : "Unable to load this source.",
        );
      } finally {
        if (
          isLatestRequest(
            citationRequestGenerationRef.current,
            requestGeneration,
          )
        ) {
          setCitationLoading(false);
        }
      }
    },
    [citationCache],
  );

  const openFullLabel = useCallback(() => {
    if (!selectedCitation) {
      return;
    }

    void Linking.openURL(selectedCitation.labelUrl).catch(() => {
      Alert.alert(
        "Unable to open DailyMed",
        "The label could not be opened on this device.",
      );
    });
  }, [selectedCitation]);

  const canChangeMedication = messages.length === 0 && !isSending;

  const sendDisabled =
    isSending || !input.trim() || selectedMedicationId === null;

  return (
    <SafeAreaView
      edges={["top"]}
      style={[
        styles.safeArea,
        {
          backgroundColor: theme.backgroundElement,
        },
      ]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: theme.text }]}>Ask Moeen</Text>

            <Text
              style={[
                styles.subtitle,
                {
                  color: theme.textSecondary,
                },
              ]}
            >
              Understand your medicines
            </Text>
          </View>

          {messages.length > 0 ? (
            <Pressable
              disabled={isSending}
              onPress={startNewChat}
              style={({ pressed }) => [
                styles.newChatButton,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.backgroundSelected,
                  opacity: isSending ? 0.45 : pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons name="add" size={18} color={theme.primary} />

              <Text
                style={[
                  styles.newChatText,
                  {
                    color: theme.primary,
                  },
                ]}
              >
                New chat
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View
          style={[
            styles.disclaimer,
            {
              backgroundColor: theme.primaryLight,
              borderColor: theme.primary,
            },
          ]}
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={20}
            color={theme.primary}
          />

          <Text
            style={[
              styles.disclaimerText,
              {
                color: theme.text,
              },
            ]}
          >
            Moeen explains medicines and does not prescribe.
          </Text>
        </View>

        <View style={styles.medicationArea}>
          <View style={styles.medicationHeader}>
            <Text
              style={[
                styles.sectionLabel,
                {
                  color: theme.textSecondary,
                },
              ]}
            >
              MEDICATION
            </Text>

            {!canChangeMedication ? (
              <Text
                style={[
                  styles.lockedText,
                  {
                    color: theme.textSecondary,
                  },
                ]}
              >
                Start a new chat to change
              </Text>
            ) : null}
          </View>

          {isLoadingMedications ? (
            <View style={styles.medicationLoading}>
              <ActivityIndicator size="small" color={theme.primary} />

              <Text
                style={{
                  color: theme.textSecondary,
                }}
              >
                Loading medications...
              </Text>
            </View>
          ) : medicationError ? (
            <View
              style={[
                styles.medicationError,
                {
                  borderColor: theme.dangerLight,
                  backgroundColor: theme.background,
                },
              ]}
            >
              <Text
                style={[
                  styles.medicationErrorText,
                  {
                    color: theme.danger,
                  },
                ]}
              >
                {medicationError}
              </Text>

              <Pressable
                onPress={() => {
                  void loadMedications();
                }}
              >
                <Text
                  style={{
                    color: theme.primary,
                    fontWeight: "700",
                  }}
                >
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : medications.length === 0 ? (
            <View
              style={[
                styles.noMedication,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.backgroundSelected,
                },
              ]}
            >
              <Ionicons
                name="medical-outline"
                size={18}
                color={theme.textSecondary}
              />

              <Text
                style={[
                  styles.noMedicationText,
                  {
                    color: theme.textSecondary,
                  },
                ]}
              >
                Add an active medication before starting a medicine chat.
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.medicationChips}
            >
              {medications.map((medication) => {
                const selected = medication.id === selectedMedicationId;

                return (
                  <Pressable
                    key={medication.id}
                    disabled={!canChangeMedication}
                    onPress={() => setSelectedMedicationId(medication.id)}
                    style={({ pressed }) => [
                      styles.medicationChip,
                      {
                        backgroundColor: selected
                          ? theme.primary
                          : theme.background,
                        borderColor: selected
                          ? theme.primary
                          : theme.backgroundSelected,
                        opacity: !canChangeMedication
                          ? selected
                            ? 1
                            : 0.45
                          : pressed
                            ? 0.75
                            : 1,
                      },
                    ]}
                  >
                    <Ionicons
                      name="medical"
                      size={15}
                      color={selected ? theme.onPrimary : theme.primary}
                    />

                    <Text
                      numberOfLines={1}
                      style={[
                        styles.medicationChipText,
                        {
                          color: selected ? theme.onPrimary : theme.text,
                        },
                      ]}
                    >
                      {medicationName(medication)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={
            messages.length === 0 ? styles.emptyMessages : styles.messageContent
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <View
                style={[
                  styles.botIcon,
                  {
                    backgroundColor: theme.primaryLight,
                  },
                ]}
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={32}
                  color={theme.primary}
                />
              </View>

              <Text
                style={[
                  styles.emptyTitle,
                  {
                    color: theme.text,
                  },
                ]}
              >
                Ask about your medicine
              </Text>

              <Text
                style={[
                  styles.emptyText,
                  {
                    color: theme.textSecondary,
                  },
                ]}
              >
                {selectedMedication
                  ? `Ask what ${medicationName(
                      selectedMedication,
                    )} is for, what it contains, or about information on its label.`
                  : "Choose one of your active medications to begin."}
              </Text>
            </View>
          ) : (
            messages.map((message) => {
              const isUser = message.role === "user";

              return (
                <View
                  key={message.id}
                  style={[
                    styles.messageRow,
                    isUser ? styles.userRow : styles.assistantRow,
                  ]}
                >
                  {!isUser ? (
                    <View
                      style={[
                        styles.avatar,
                        {
                          backgroundColor: theme.primaryLight,
                        },
                      ]}
                    >
                      <Ionicons
                        name="medical"
                        size={15}
                        color={theme.primary}
                      />
                    </View>
                  ) : null}

                  <View
                    style={[
                      styles.bubble,
                      isUser
                        ? {
                            backgroundColor: theme.primary,
                          }
                        : {
                            backgroundColor: theme.background,
                            borderColor: theme.backgroundSelected,
                            borderWidth: 1,
                          },
                    ]}
                  >
                    {message.status === "streaming" && !message.text ? (
                      <View style={styles.thinking}>
                        <ActivityIndicator size="small" color={theme.primary} />

                        <Text
                          style={{
                            color: theme.textSecondary,
                          }}
                        >
                          Moeen is preparing a safe response...
                        </Text>
                      </View>
                    ) : (
                      <Text
                        style={[
                          styles.messageText,
                          {
                            color: isUser ? theme.onPrimary : theme.text,
                          },
                        ]}
                      >
                        {message.text}
                      </Text>
                    )}

                    {message.status === "failed" ? (
                      <View
                        style={[
                          styles.failureBox,
                          {
                            borderTopColor: theme.dangerLight,
                          },
                        ]}
                      >
                        <View style={styles.failureCopy}>
                          <Ionicons
                            name="alert-circle-outline"
                            size={17}
                            color={theme.danger}
                          />

                          <Text
                            style={[
                              styles.failureText,
                              {
                                color: theme.danger,
                              },
                            ]}
                          >
                            {message.error ?? "The connection was interrupted."}
                          </Text>
                        </View>

                        <Pressable
                          disabled={isSending}
                          onPress={() => handleRetry(message)}
                          style={[
                            styles.retryButton,
                            {
                              borderColor: theme.primary,
                              opacity: isSending ? 0.45 : 1,
                            },
                          ]}
                        >
                          <Ionicons
                            name="refresh"
                            size={15}
                            color={theme.primary}
                          />

                          <Text
                            style={[
                              styles.retryText,
                              {
                                color: theme.primary,
                              },
                            ]}
                          >
                            Retry
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}

                    {!isUser &&
                    message.status === "complete" &&
                    message.citations.length > 0 ? (
                      <View style={styles.citations}>
                        <Text
                          style={[
                            styles.sourcesLabel,
                            {
                              color: theme.textSecondary,
                            },
                          ]}
                        >
                          Sources
                        </Text>

                        <View style={styles.citationRow}>
                          {message.citations.map((citationId, index) => {
                            const cached = citationCache[citationId];

                            return (
                              <Pressable
                                key={citationId}
                                onPress={() => {
                                  void loadCitation(citationId);
                                }}
                                style={[
                                  styles.citationChip,
                                  {
                                    backgroundColor: theme.primaryLight,
                                  },
                                ]}
                              >
                                <Ionicons
                                  name="document-text-outline"
                                  size={14}
                                  color={theme.primary}
                                />

                                <Text
                                  style={[
                                    styles.citationText,
                                    {
                                      color: theme.primaryDark,
                                    },
                                  ]}
                                >
                                  {cached
                                    ? formatSection(cached.section)
                                    : `Source ${index + 1}`}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    ) : null}

                    {!isUser &&
                    message.validationStatus === "rejected_fallback" ? (
                      <Text
                        style={[
                          styles.fallbackLabel,
                          {
                            color: theme.textSecondary,
                          },
                        ]}
                      >
                        Safety response
                      </Text>
                    ) : null}

                    {!isUser && message.escalation ? (
                      <View style={styles.escalationBanner}>
                        <EscalateDirectiveBanner
                          directiveText={message.escalation.directive}
                          medications={medications}
                          doseHistory={escalationExports[message.id] ?? []}
                          onShareWithProvider={shareEscalationReportWithProvider}
                        />
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <View
          style={[
            styles.composer,
            {
              backgroundColor: theme.background,
              borderTopColor: theme.backgroundSelected,
            },
          ]}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            editable={selectedMedicationId !== null && !isSending}
            multiline
            placeholder={
              selectedMedication
                ? `Ask about ${medicationName(selectedMedication)}...`
                : "Choose a medication first"
            }
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
                borderColor: theme.backgroundSelected,
              },
            ]}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={() => {
              if (!input.includes("\n")) {
                handleSend();
              }
            }}
          />

          <Pressable
            accessibilityLabel="Send message"
            disabled={sendDisabled}
            onPress={handleSend}
            style={({ pressed }) => [
              styles.sendButton,
              {
                backgroundColor: sendDisabled
                  ? theme.backgroundSelected
                  : theme.primary,
                opacity: pressed && !sendDisabled ? 0.75 : 1,
              },
            ]}
          >
            {isSending ? (
              <ActivityIndicator size="small" color={theme.onPrimary} />
            ) : (
              <Ionicons
                name="send"
                size={19}
                color={sendDisabled ? theme.textSecondary : theme.onPrimary}
              />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={citationModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCitationModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.background,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons
                  name="document-text-outline"
                  size={21}
                  color={theme.primary}
                />

                <Text
                  style={[
                    styles.modalTitle,
                    {
                      color: theme.text,
                    },
                  ]}
                >
                  Medication label source
                </Text>
              </View>

              <Pressable
                accessibilityLabel="Close citation"
                onPress={() => setCitationModalVisible(false)}
                style={[
                  styles.closeButton,
                  {
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
              >
                <Ionicons name="close" size={20} color={theme.text} />
              </Pressable>
            </View>

            {citationLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={theme.primary} />

                <Text
                  style={{
                    color: theme.textSecondary,
                  }}
                >
                  Loading cited section...
                </Text>
              </View>
            ) : citationError ? (
              <View style={styles.modalLoading}>
                <Ionicons
                  name="alert-circle-outline"
                  size={30}
                  color={theme.danger}
                />

                <Text
                  style={[
                    styles.modalError,
                    {
                      color: theme.danger,
                    },
                  ]}
                >
                  {citationError}
                </Text>

                {citationTargetId ? (
                  <Pressable
                    onPress={() => {
                      void loadCitation(citationTargetId);
                    }}
                    style={[
                      styles.modalRetry,
                      {
                        backgroundColor: theme.primary,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: theme.onPrimary,
                        fontWeight: "700",
                      }}
                    >
                      Try again
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : selectedCitation ? (
              <>
                <View
                  style={[
                    styles.sectionBadge,
                    {
                      backgroundColor: theme.primaryLight,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.sectionBadgeText,
                      {
                        color: theme.primaryDark,
                      },
                    ]}
                  >
                    {formatSection(selectedCitation.section)}
                  </Text>
                </View>

                <ScrollView
                  style={styles.citationExcerptScroll}
                  contentContainerStyle={styles.citationExcerptContent}
                >
                  <Text
                    style={[
                      styles.citationExcerpt,
                      {
                        color: theme.text,
                      },
                    ]}
                  >
                    {selectedCitation.text}
                  </Text>
                </ScrollView>

                <Text
                  style={[
                    styles.setId,
                    {
                      color: theme.textSecondary,
                    },
                  ]}
                >
                  DailyMed set ID: {selectedCitation.setId}
                </Text>

                <Pressable
                  onPress={openFullLabel}
                  style={[
                    styles.openLabelButton,
                    {
                      backgroundColor: theme.primary,
                    },
                  ]}
                >
                  <Ionicons
                    name="open-outline"
                    size={18}
                    color={theme.onPrimary}
                  />

                  <Text
                    style={[
                      styles.openLabelText,
                      {
                        color: theme.onPrimary,
                      },
                    ]}
                  >
                    Open full DailyMed label
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  safeArea: {
    flex: 1,
  },

  header: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  headerCopy: {
    flex: 1,
  },

  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.4,
  },

  subtitle: {
    marginTop: 1,
    fontSize: 13,
  },

  newChatButton: {
    minHeight: 38,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  newChatText: {
    fontSize: 13,
    fontWeight: "700",
  },

  disclaimer: {
    marginHorizontal: 18,
    marginBottom: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  disclaimerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },

  medicationArea: {
    paddingBottom: 8,
  },

  medicationHeader: {
    paddingHorizontal: 18,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  lockedText: {
    fontSize: 11,
  },

  medicationLoading: {
    height: 40,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  medicationError: {
    marginHorizontal: 16,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  medicationErrorText: {
    flex: 1,
    fontSize: 12,
  },

  noMedication: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },

  noMedicationText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },

  medicationChips: {
    paddingHorizontal: 18,
    paddingBottom: 2,
    gap: 8,
  },

  medicationChip: {
    maxWidth: 210,
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  medicationChipText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
  },

  messages: {
    flex: 1,
  },

  messageContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 14,
  },

  emptyMessages: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 30,
    paddingBottom: 30,
  },

  emptyState: {
    alignItems: "center",
  },

  botIcon: {
    width: 66,
    height: 66,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  emptyTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
    textAlign: "center",
  },

  emptyText: {
    marginTop: 7,
    maxWidth: 320,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },

  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 7,
  },

  userRow: {
    justifyContent: "flex-end",
    paddingLeft: 48,
  },

  assistantRow: {
    justifyContent: "flex-start",
    paddingRight: 30,
  },

  avatar: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  bubble: {
    maxWidth: "88%",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: "#173E2A",
    shadowOpacity: 0.025,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },

  thinking: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 24,
  },

  failureBox: {
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: 1,
    gap: 8,
  },

  failureCopy: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },

  failureText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },

  retryButton: {
    alignSelf: "flex-start",
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  retryText: {
    fontSize: 12,
    fontWeight: "800",
  },

  citations: {
    marginTop: 10,
    gap: 6,
  },

  sourcesLabel: {
    fontSize: 11,
    fontWeight: "700",
  },

  citationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },

  citationChip: {
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  citationText: {
    fontSize: 11,
    fontWeight: "800",
  },

  fallbackLabel: {
    marginTop: 7,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  escalationBanner: {
    marginTop: 10,
  },

  composer: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 9,
    shadowColor: "#173E2A",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 5,
  },

  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 11,
    fontSize: 15,
    lineHeight: 20,
  },

  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(18, 28, 22, 0.46)",
  },

  modalCard: {
    maxHeight: "75%",
    borderRadius: Radius.large,
    padding: 20,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  modalTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  modalTitle: {
    flex: 1,
    ...Typography.sectionTitle,
    fontSize: 18,
    lineHeight: 24,
  },

  closeButton: {
    width: 34,
    height: 34,
    borderRadius: Radius.control,
    alignItems: "center",
    justifyContent: "center",
  },

  modalLoading: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 20,
  },

  modalError: {
    ...Typography.caption,
    textAlign: "center",
  },

  modalRetry: {
    paddingHorizontal: 16,
    height: 38,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },

  sectionBadge: {
    alignSelf: "flex-start",
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 16,
  },

  sectionBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },

  citationExcerptScroll: {
    marginTop: 12,
    maxHeight: 260,
  },

  citationExcerptContent: {
    paddingBottom: 8,
  },

  citationExcerpt: {
    fontSize: 15,
    lineHeight: 22,
  },

  setId: {
    marginTop: 8,
    fontSize: 11,
  },

  openLabelButton: {
    minHeight: 44,
    borderRadius: 22,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  openLabelText: {
    fontSize: 14,
    fontWeight: "800",
  },
});
