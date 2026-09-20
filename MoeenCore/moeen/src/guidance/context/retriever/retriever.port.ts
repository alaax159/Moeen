import {
  GuidanceIntent,
  LabelSection,
  PatientScope,
  RetrievalResult,
} from '../../contracts';

/**
 * Confirmed with Salam: at the call site, the orchestrator already has
 * request.intent, request.question, and intentConfig.retrievalSections in
 * scope — assembling these params is just reading values already available,
 * not inventing new plumbing.
 *
 * question is optional and maps straight from GuidanceRequest.question,
 * which only medication_question ever populates. When it's absent
 * (missed_dose, explain_finding, or a stray medication_question with no
 * text), the service derives a default internally — see query-text.ts.
 * That's retrieval strategy, this folder's own domain, not something the
 * orchestrator should have to invent text for.
 *
 * intent also drives section-priority weighting (see section-priority.ts)
 * — it's separate from sections because two intents can share an
 * overlapping sections list but still want a different ranking within it.
 */
interface BaseRetrieveEvidenceParams {
  scope: PatientScope;
  sections: readonly LabelSection[];
  question?: string;
}

/**
 * Finding explanations are a stricter retrieval mode: the immutable finding's
 * user_medication IDs must be supplied so retrieval can target only the
 * medications that finding is about. The explicit selector stays inside the
 * retrieval call and is never rendered into a model prompt.
 */
export type RetrieveEvidenceParams =
  | (BaseRetrieveEvidenceParams & {
      intent: 'explain_finding';
      findingSubjectUserMedicationIds: readonly number[];
    })
  | (BaseRetrieveEvidenceParams & {
      intent: Exclude<GuidanceIntent, 'explain_finding'>;
      findingSubjectUserMedicationIds?: never;
    });

export interface RetrieverPort {
  retrieve(params: RetrieveEvidenceParams): Promise<RetrievalResult>;
}

export const RETRIEVER_PORT = Symbol('RETRIEVER_PORT');
