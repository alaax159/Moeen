import type { GuidanceResponse } from '../../contracts';

export const STANDARD_CHAT_REFUSAL_TEXT =
  'I can explain information about medicines in your current medication list, but I cannot diagnose conditions or recommend changes to doses or schedules. Please ask your doctor or pharmacist about diagnosis, treatment changes, or medicines that are not in your current list.';

export function buildDeterministicChatRefusal(): GuidanceResponse {
  return {
    text: STANDARD_CHAT_REFUSAL_TEXT,
    citationIds: [],
    validationStatus: 'rejected_fallback',
    promptVersion: 'chat-refusal:v1',
  };
}
