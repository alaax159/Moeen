import type { AssistantDeliveryState } from "./types";

export function applyAssistantDelta(
  state: AssistantDeliveryState,
  delta: string,
  replaceExisting = false,
): AssistantDeliveryState {
  return {
    text: replaceExisting ? delta : state.text + delta,
    status: "streaming",
  };
}

export function failAssistantDelivery(
  state: AssistantDeliveryState,
  error: string,
): AssistantDeliveryState {
  return {
    ...state,
    status: "failed",
    error,
  };
}
