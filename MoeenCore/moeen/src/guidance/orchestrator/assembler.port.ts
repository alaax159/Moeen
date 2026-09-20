import { RedactablePayload, RedactionSubject } from '../context/redactor/redactor.port';
import { PatientScope, RetrievalResult, GuidanceRequest } from '../contracts';

/**
 * PLACEHOLDER — GN-1 (Alaa's prompt-assembly story) hasn't started.
 *
 * OPEN QUESTION, not resolved here: dispatch() requires a RedactionSubject
 * carrying fullName/firstName/lastName so the redactor knows what to scrub
 * — but PatientScope deliberately excludes any name field, by design, on
 * purpose. Where the actual name values would come from is unresolved.
 * Confirm with Alaa before this becomes load-bearing rather than inventing
 * a source for patient names in this pipeline.
 */
export interface AssembledPrompt {
  payload: RedactablePayload;
  redactionSubject: RedactionSubject;
  /** Stamped by GN-1's real assembler once it exists; carried through validate() and persisted on GuidanceResponse.promptVersion. */
  promptVersion: string;
}

export interface AssemblerPort {
  assemble(scope: PatientScope, retrieval: RetrievalResult, request: GuidanceRequest): Promise<AssembledPrompt>;
}

export const ASSEMBLER_PORT = Symbol('ASSEMBLER_PORT');
