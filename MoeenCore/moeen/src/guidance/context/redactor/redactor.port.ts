import { RedactionContext } from './redaction-context';

/**
 * The patient's known identifying values, used to strip their name from
 * free text. Never sourced from PatientScope — that type excludes name by
 * design (see guidance/contracts/patient-scope.contract.ts). The caller
 * (the gateway, eventually) is responsible for supplying this from wherever
 * the patient's identity actually lives.
 */
export interface RedactionSubject {
  fullName?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Anything the redactor can walk: JSON-shaped data plus `undefined`, since
 * TypeScript objects with optional fields commonly carry `undefined` rather
 * than omitting the key. Anything else (a function, a symbol, a bigint) is
 * not redactable and aborts the call — see RedactionFailedError.
 */
export type RedactablePayload =
  | string
  | number
  | boolean
  | null
  | undefined
  | RedactablePayload[]
  | { [key: string]: RedactablePayload };

export interface RedactorPort {
  /**
   * Returns a deep copy of payload with every name, email address, phone
   * number, date and UUID replaced by a stable placeholder. Throws
   * RedactionFailedError rather than returning anything if it cannot
   * guarantee the result is fully redacted.
   */
  redact<T extends RedactablePayload>(
    payload: T,
    subject: RedactionSubject,
    context: RedactionContext,
  ): T;
}

export const REDACTOR_PORT = Symbol('REDACTOR_PORT');
