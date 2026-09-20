import * as Crypto from "expo-crypto";
import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";

import { authenticatedFetch } from "@/api/authenticated-fetch";
import { auth } from "@/firebase/config";

import { consumeSseBuffer, type ParsedSseEvent } from "./sse";
import { readChatSseStream } from "./stream-reader";
import type {
  ChatCitation,
  ChatDoneEvent,
  ChatEscalation,
  ChatValidationStatus,
} from "./types";

const DEFAULT_API_BASE_URL =
  Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? DEFAULT_API_BASE_URL;

export interface StreamChatMessageInput {
  requestId: string;
  message: string;
  sessionId?: number;
  subjectMedicationId: number;
}

export interface StreamChatHandlers {
  onSession(sessionId: number): void;
  onDelta(text: string): void;
  onDone(done: ChatDoneEvent): void;
}

export class ChatApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ChatApiError";
  }
}

export function createChatRequestId(): string {
  return Crypto.randomUUID();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonObject(value: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ChatApiError("The chat stream returned malformed data.");
  }

  if (!isObject(parsed)) {
    throw new ChatApiError("The chat stream returned an invalid event.");
  }

  return parsed;
}

function isValidationStatus(value: unknown): value is ChatValidationStatus {
  return value === "accepted" || value === "rejected_fallback";
}

/**
 * Reads the optional `escalation` object off the `done` event (backend
 * GuidanceEscalation). Parsed leniently: an object with a non-empty string
 * `directive` is kept; anything else — missing, null, wrong shape — is `null`.
 * Never throws, so an unexpected shape degrades to "no escalation" rather than
 * failing the stream.
 */
function parseChatEscalation(value: unknown): ChatEscalation | null {
  if (
    isObject(value) &&
    typeof value.directive === "string" &&
    value.directive.length > 0
  ) {
    return { directive: value.directive };
  }

  return null;
}

function dispatchEvent(
  event: ParsedSseEvent,
  handlers: StreamChatHandlers,
): boolean {
  const data = parseJsonObject(event.data);

  if (event.event === "session") {
    const sessionId = data.sessionId;

    if (
      typeof sessionId !== "number" ||
      !Number.isInteger(sessionId) ||
      sessionId <= 0
    ) {
      throw new ChatApiError("The chat stream returned an invalid session.");
    }

    handlers.onSession(sessionId);
    return false;
  }

  if (event.event === "delta") {
    if (typeof data.text !== "string") {
      throw new ChatApiError("The chat stream returned invalid message text.");
    }

    handlers.onDelta(data.text);
    return false;
  }

  if (event.event === "done") {
    const citations = data.citations;
    const validationStatus = data.validationStatus;
    const promptVersion = data.promptVersion;

    if (
      !Array.isArray(citations) ||
      !citations.every((citation) => typeof citation === "string") ||
      !isValidationStatus(validationStatus) ||
      typeof promptVersion !== "string"
    ) {
      throw new ChatApiError(
        "The chat stream returned invalid completion metadata.",
      );
    }

    handlers.onDone({
      citations,
      validationStatus,
      promptVersion,
      escalation: parseChatEscalation(data.escalation),
    });

    return true;
  }

  return false;
}

async function getHttpErrorMessage(
  response: Awaited<ReturnType<typeof expoFetch>>,
): Promise<string> {
  let body: unknown = null;

  try {
    const text = await response.text();

    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
  } catch {
    body = null;
  }

  if (isObject(body) && "message" in body) {
    const message = body.message;

    if (Array.isArray(message)) {
      return message.map(String).join("\n");
    }

    return String(message);
  }

  if (response.status === 409) {
    return "This response is still being prepared. Try again in a moment.";
  }

  return `Unable to send message (${response.status}).`;
}

export async function streamChatMessage(
  input: StreamChatMessageInput,
  handlers: StreamChatHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const user = auth.currentUser;

  if (!user) {
    throw new ChatApiError("User is not authenticated.", 401);
  }

  const token = await user.getIdToken();

  const response = await expoFetch(`${API_BASE_URL}/chat/messages`, {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requestId: input.requestId,
      message: input.message,
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      subjectMedicationId: input.subjectMedicationId,
    }),
    signal,
  });

  if (!response.ok) {
    throw new ChatApiError(
      await getHttpErrorMessage(response),
      response.status,
    );
  }

  let receivedDone = false;

  const handleParsedEvents = (events: ParsedSseEvent[]) => {
    for (const event of events) {
      if (dispatchEvent(event, handlers)) {
        receivedDone = true;
      }
    }
  };

  if (!response.body) {
    const entireBody = await response.text();
    const parsed = consumeSseBuffer(entireBody, true);

    handleParsedEvents(parsed.events);
  } else {
    await readChatSseStream(response.body.getReader(), (event) => {
      handleParsedEvents([event]);
    });
  }

  if (!receivedDone) {
    throw new ChatApiError(
      "The connection ended before Moeen finished the response.",
    );
  }
}

function parseCitation(value: unknown): ChatCitation {
  if (
    !isObject(value) ||
    typeof value.citationId !== "string" ||
    typeof value.setId !== "string" ||
    typeof value.section !== "string" ||
    typeof value.text !== "string" ||
    typeof value.labelUrl !== "string"
  ) {
    throw new ChatApiError("The citation response was invalid.");
  }

  return {
    citationId: value.citationId,
    setId: value.setId,
    section: value.section,
    text: value.text,
    labelUrl: value.labelUrl,
  };
}

export async function getChatCitation(
  citationId: string,
): Promise<ChatCitation> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/chat/citations/${encodeURIComponent(citationId)}`,
  );

  const text = await response.text();

  let body: unknown = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const message =
      isObject(body) && "message" in body
        ? String(body.message)
        : `Unable to load citation (${response.status}).`;

    throw new ChatApiError(message, response.status);
  }

  return parseCitation(body);
}
