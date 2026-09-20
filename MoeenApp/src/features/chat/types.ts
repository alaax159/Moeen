export type ChatValidationStatus = "accepted" | "rejected_fallback";

/**
 * Mirrors the backend GuidanceEscalation (MoeenCore commit 81979a9,
 * src/guidance/contracts/guidance-response.contract.ts), minus its `triggered`
 * flag: the backend attaches `escalation` to the `done` event only while
 * escalating, so presence already carries the signal `triggered` would.
 * `directive` is the fixed, non-generated ESCALATION_DIRECTIVE text.
 */
export interface ChatEscalation {
  directive: string;
}

export interface ChatDoneEvent {
  citations: string[];
  validationStatus: ChatValidationStatus;
  promptVersion: string;
  /** Present only while the backend is escalating; `null` when the event omits it. */
  escalation?: ChatEscalation | null;
}

export interface ChatCitation {
  citationId: string;
  setId: string;
  section: string;
  text: string;
  labelUrl: string;
}

export type AssistantDeliveryStatus = "streaming" | "complete" | "failed";

export interface AssistantDeliveryState {
  text: string;
  status: AssistantDeliveryStatus;
  error?: string;
}
