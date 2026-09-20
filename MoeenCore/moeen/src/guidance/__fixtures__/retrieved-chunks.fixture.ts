import type { RetrievalResult, RetrievedChunk } from '../contracts';

/**
 * Two medications (by setId), two-plus sections each — the minimum shape
 * Islam's CX-2 leakage tests and Alaa's GN-3 validator tests both need:
 * chunks that unambiguously belong to different medications.
 */
export const retrievedChunkFixtures = {
  warfarinInteractions: {
    citationId: 'chunk-warfarin-interactions-01',
    setId: 'setid-warfarin-001',
    section: 'drug_interactions',
    text: 'Warfarin interacts with aspirin and other NSAIDs, increasing bleeding risk.',
  },

  warfarinDosage: {
    citationId: 'chunk-warfarin-dosage-01',
    setId: 'setid-warfarin-001',
    section: 'dosage_and_administration',
    text: 'Warfarin dosing is individualized based on INR monitoring.',
  },

  aspirinWarnings: {
    citationId: 'chunk-aspirin-warnings-01',
    setId: 'setid-aspirin-001',
    section: 'warnings',
    text: 'Aspirin should be used with caution in patients on anticoagulants.',
  },

  aspirinIndications: {
    citationId: 'chunk-aspirin-indications-01',
    setId: 'setid-aspirin-001',
    section: 'indications',
    text: 'Aspirin is indicated for pain relief and cardiovascular prophylaxis.',
  },
} as const satisfies Record<string, RetrievedChunk>;

export const retrievedChunkList: RetrievedChunk[] = Object.values(
  retrievedChunkFixtures,
);

export const retrievalResultFixtures = {
  found: {
    found: true,
    chunks: [
      retrievedChunkFixtures.warfarinInteractions,
      retrievedChunkFixtures.aspirinWarnings,
    ],
  },
  noEvidence: { found: false },
} as const satisfies Record<string, RetrievalResult>;
