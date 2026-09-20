export type LabelSection =
  | 'indications'
  | 'dosage_and_administration'
  | 'warnings'
  | 'contraindications'
  | 'adverse_reactions'
  | 'drug_interactions';

export interface RetrievedChunk {
  /** Stable id the validator checks generated citations against — must not change across retrieval runs for the same underlying label_chunk row. */
  citationId: string;
  setId: string;
  section: LabelSection;
  text: string;
}

/**
 * Discriminated so "no evidence" can never be mistaken for an empty-but-
 * successful result by a caller that forgot to check length.
 */
export type RetrievalResult =
  { found: true; chunks: RetrievedChunk[] } | { found: false };
