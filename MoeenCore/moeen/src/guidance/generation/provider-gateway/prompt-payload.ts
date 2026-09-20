import { RedactablePayload } from '../../context/redactor/redactor.port';

/**
 * The only shape the gateway will put in front of a model: two strings, both
 * already redacted.
 *
 * ProviderGateway.dispatch() still accepts any RedactablePayload — that is the
 * signature Salam's orchestrator compiles against — but it narrows to this
 * before dispatch and refuses anything else. Two consequences worth stating:
 *
 * 1. A payload with no system prompt cannot reach the provider. The system
 *    prompt is where GN-1 puts every constraint ("explain, never prescribe",
 *    "cite only what you were given"). A call without it is a call with no
 *    guard rails, so it is a failure, not a best-effort dispatch.
 * 2. Only these two fields cross the wire. Whatever else the payload carried —
 *    ids, versions, retrieval bookkeeping — is redacted and then dropped,
 *    because the adapter never reads it. Fields we do not send cannot leak.
 */
/**
 * A type alias, deliberately, not an interface. TypeScript gives an object
 * type alias an implicit index signature and an interface none, so only this
 * form is assignable to RedactablePayload — which is what lets a caller hand a
 * typed prompt straight to dispatch() without a cast. Changing this back to an
 * `interface` compiles here and breaks every call site.
 */
export type PromptPayload = {
  systemPrompt: string;
  userPrompt: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isPromptPayload(
  payload: RedactablePayload,
): payload is PromptPayload & { [key: string]: RedactablePayload } {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return false;
  }

  const candidate = payload as Record<string, RedactablePayload>;
  return (
    isNonEmptyString(candidate.systemPrompt) &&
    isNonEmptyString(candidate.userPrompt)
  );
}
