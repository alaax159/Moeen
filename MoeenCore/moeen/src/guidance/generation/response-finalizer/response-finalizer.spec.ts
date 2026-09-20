import { Logger } from '@nestjs/common';

import type {
  GuidanceResponse,
  RetrievalResult,
  SafetyCheckResult,
} from '../../contracts';
import {
  retrievedChunkFixtures,
  safetyCheckResultFixtures,
} from '../../__fixtures__';
import { FallbackRenderer } from '../fallback-renderer/fallback-renderer.service';
import { DECISION_LINE } from '../fallback-renderer/fallback-copy';
import { generationFailure } from '../provider-gateway/generation-failure';
import type { ProviderDispatchResult } from '../provider-gateway/provider-gateway.port';
import {
  CLEAN_ANSWER,
  envelope,
  groundEverySentence,
  testValidator,
} from '../response-validator/response-validator.fixtures';
import { InMemoryRejectedCandidateStore } from './in-memory-rejected-candidate-store.service';
import type { RejectedCandidate } from './rejected-candidate';
import type { RejectedCandidateStorePort } from './rejected-candidate-store.port';
import { ResponseFinalizer } from './response-finalizer.service';

const SUPPLIED_ID = retrievedChunkFixtures.warfarinInteractions.citationId;

const retrieval: RetrievalResult = {
  found: true,
  chunks: [
    { ...retrievedChunkFixtures.warfarinInteractions },
    { ...retrievedChunkFixtures.aspirinWarnings },
  ],
};

const noEvidence: RetrievalResult = { found: false };

const PROMPT_VERSION = 'gn1.1:explain_finding:with-evidence:3f9c1e2a';

const safety: SafetyCheckResult = safetyCheckResultFixtures.moderateInteraction;

function generated(rawText: string): ProviderDispatchResult {
  return { text: rawText, redactionCount: 2, outcome: 'generated' };
}

function providerDown(): ProviderDispatchResult {
  return {
    text: '',
    redactionCount: 0,
    outcome: 'fallback_required',
    failure: generationFailure('timeout', 'provider took too long'),
  };
}

function build(
  store: RejectedCandidateStorePort = new InMemoryRejectedCandidateStore(),
) {
  return {
    finalizer: new ResponseFinalizer(
      testValidator(),
      new FallbackRenderer(),
      store,
    ),
    store,
  };
}

const context = { intent: 'explain_finding' as const, patientId: 1002, safety };

/** Quietens the deliberate warn/debug lines these paths are supposed to emit. */
beforeAll(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('ResponseFinalizer', () => {
  describe('a clean generation', () => {
    it('returns the model text, its citations and an accepted status', async () => {
      const { finalizer, store } = build();

      const response = await finalizer.validate(
        generated(envelope(CLEAN_ANSWER, [SUPPLIED_ID])),
        retrieval,
        PROMPT_VERSION,
        context,
      );

      expect(response).toEqual<GuidanceResponse>({
        text: CLEAN_ANSWER,
        citationIds: [SUPPLIED_ID],
        validationStatus: 'accepted',
        promptVersion: PROMPT_VERSION,
      });
      expect((store as InMemoryRejectedCandidateStore).size).toBe(0);
    });
  });

  describe('a generation missing the required referral', () => {
    const missingReferral = envelope(
      'Thanks for asking. If you feel unwell or something is worrying you, medical help is available now.',
      [],
    );

    it('rejects the candidate and returns deterministic fallback text', async () => {
      const { finalizer, store } = build();

      const response = await finalizer.validate(
        generated(missingReferral),
        retrieval,
        PROMPT_VERSION,
        context,
      );

      expect(response.validationStatus).toBe('rejected_fallback');
      expect(response.text).toContain('Medicine interaction');
      expect(response.text).toContain(DECISION_LINE);
      expect(response.text).not.toContain(
        'Thanks for asking. I can explain this in plain language.',
      );
      expect(response.citationIds).toEqual([]);

      const [retained] = (store as InMemoryRejectedCandidateStore).list();

      expect(retained.reason).toBe('validation_rejected');
      expect(retained.candidateText).toBe(missingReferral);
      expect(retained.violations.map((violation) => violation.code)).toEqual([
        'missing_referral',
      ]);
    });
  });

  describe('a generated answer missing the standing medical-help signpost', () => {
    const missingMedicalHelp = envelope(
      'Thanks for asking. Please discuss medicine decisions with your doctor.',
      [],
    );

    it('rejects the candidate and routes it through deterministic fallback', async () => {
      const { finalizer, store } = build();

      const response = await finalizer.validate(
        generated(missingMedicalHelp),
        retrieval,
        PROMPT_VERSION,
        context,
      );

      expect(response.validationStatus).toBe('rejected_fallback');
      expect(response.text).toContain('Medicine interaction');
      expect(response.text).toContain('medical help is available now');
      expect(response.text).not.toContain(
        'Thanks for asking. Please discuss medicine decisions with your doctor.',
      );

      const [retained] = (store as InMemoryRejectedCandidateStore).list();

      expect(retained.reason).toBe('validation_rejected');
      expect(retained.candidateText).toBe(missingMedicalHelp);
      expect(retained.violations.map((violation) => violation.code)).toEqual([
        'missing_medical_help_signpost',
      ]);
    });
  });

  describe('a refused generation', () => {
    const invented = envelope(
      'Your usual dose is 5 mg, so take two tablets tonight and carry on as normal.',
      [SUPPLIED_ID],
    );

    it('answers the patient from the finding set instead, and says so in the status', async () => {
      const { finalizer } = build();

      const response = await finalizer.validate(
        generated(invented),
        retrieval,
        PROMPT_VERSION,
        context,
      );

      expect(response.validationStatus).toBe('rejected_fallback');
      expect(response.text).toContain('Medicine interaction');
      expect(response.text).toContain('rated moderate');
      expect(response.text).toContain(DECISION_LINE);
      expect(response.promptVersion).toBe(PROMPT_VERSION);
    });

    it('never lets the refused text or its citations reach the client', async () => {
      const { finalizer } = build();

      const response = await finalizer.validate(
        generated(invented),
        retrieval,
        PROMPT_VERSION,
        context,
      );

      expect(response.text).not.toContain('5 mg');
      expect(response.text).not.toContain('two tablets');
      expect(response.citationIds).toEqual([]);
      // Nothing on the response carries the candidate, the violations or the
      // reason — the client is told the answer is a fallback and no more.
      expect(Object.keys(response).sort()).toEqual([
        'citationIds',
        'promptVersion',
        'text',
        'validationStatus',
      ]);
      expect(JSON.stringify(response)).not.toContain('dose_amount');
    });

    it('retains the candidate, its violations and both citation sets for review', async () => {
      const { finalizer, store } = build();

      await finalizer.validate(
        generated(invented),
        retrieval,
        PROMPT_VERSION,
        context,
      );

      const [retained] = (store as InMemoryRejectedCandidateStore).list();

      expect(retained.reason).toBe('validation_rejected');
      expect(retained.candidateText).toBe(invented);
      expect(retained.citedIds).toEqual([SUPPLIED_ID]);
      expect(retained.suppliedCitationIds).toEqual([
        SUPPLIED_ID,
        retrievedChunkFixtures.aspirinWarnings.citationId,
      ]);
      expect(retained.violations.map((violation) => violation.code)).toContain(
        'dose_amount',
      );
      expect(retained.patientId).toBe(1002);
      expect(retained.intent).toBe('explain_finding');
      expect(retained.promptVersion).toBe(PROMPT_VERSION);
      expect(Date.parse(retained.rejectedAt)).not.toBeNaN();
    });

    it('logs the rejection reason', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const { finalizer } = build();

      await finalizer.validate(
        generated(invented),
        retrieval,
        PROMPT_VERSION,
        context,
      );

      const line = warn.mock.calls
        .map(([message]) => String(message))
        .join('\n');
      expect(line).toContain('validation_rejected');
      expect(line).toContain('dose_amount');
      expect(line).toContain(PROMPT_VERSION);
    });
  });

  describe('stored severity reaches the validator', () => {
    it('rejects an overall downgrade on a mixed finding set', async () => {
      const { finalizer, store } = build();
      const mixed = safetyCheckResultFixtures.mixedHighestWins;

      const response = await finalizer.validate(
        generated(envelope('Overall, this is a minor issue.', [SUPPLIED_ID])),
        retrieval,
        PROMPT_VERSION,
        {
          intent: 'explain_finding',
          patientId: mixed.patientId,
          safety: mixed,
        },
      );

      expect(response.validationStatus).toBe('rejected_fallback');
      expect(
        (store as InMemoryRejectedCandidateStore)
          .list()[0]
          .violations.map((violation) => violation.code),
      ).toContain('severity_contradiction');
    });
  });

  describe('citations are checked against what was really retrieved', () => {
    it('rejects an id that was not in this run and falls back', async () => {
      const { finalizer, store } = build();

      const response = await finalizer.validate(
        generated(envelope(CLEAN_ANSWER, ['chunk-invented-99'])),
        retrieval,
        PROMPT_VERSION,
        context,
      );

      expect(response.validationStatus).toBe('rejected_fallback');
      expect(
        (store as InMemoryRejectedCandidateStore)
          .list()[0]
          .violations.map((violation) => violation.code),
      ).toContain('unknown_citation_id');
    });

    it('retains claim-level ids for review when the top-level summary is invalid', async () => {
      const { finalizer, store } = build();
      const invalidSummary = envelope(
        CLEAN_ANSWER,
        [],
        groundEverySentence(CLEAN_ANSWER, [SUPPLIED_ID]),
      );

      const response = await finalizer.validate(
        generated(invalidSummary),
        retrieval,
        PROMPT_VERSION,
        context,
      );

      expect(response.validationStatus).toBe('rejected_fallback');
      const [retained] = (store as InMemoryRejectedCandidateStore).list();
      expect(retained.citedIds).toEqual([SUPPLIED_ID]);
      expect(retained.violations.map(({ code }) => code)).toContain(
        'invalid_claim_grounding',
      );
    });

    it('treats a no-evidence run as supplying nothing at all', async () => {
      const { finalizer, store } = build();

      const response = await finalizer.validate(
        generated(envelope(CLEAN_ANSWER, [SUPPLIED_ID])),
        noEvidence,
        PROMPT_VERSION,
        context,
      );

      expect(response.validationStatus).toBe('rejected_fallback');
      expect(
        (store as InMemoryRejectedCandidateStore).list()[0].suppliedCitationIds,
      ).toEqual([]);
    });
  });

  describe('a provider that produced nothing', () => {
    it('still answers the patient, and marks the reason as an outage rather than a rejection', async () => {
      const { finalizer, store } = build();

      const response = await finalizer.validate(
        providerDown(),
        retrieval,
        PROMPT_VERSION,
        context,
      );

      expect(response.text).toContain('Medicine interaction');
      expect(response.validationStatus).toBe('rejected_fallback');

      const [retained] = (store as InMemoryRejectedCandidateStore).list();
      expect(retained.reason).toBe('provider_unavailable');
      expect(retained.candidateText).toBe('');
      expect(retained.violations).toEqual([]);
    });
  });

  describe('the patient always gets something', () => {
    const paths: [string, ProviderDispatchResult][] = [
      ['a clean answer', generated(envelope(CLEAN_ANSWER, [SUPPLIED_ID]))],
      ['an invented dose', generated(envelope('Take 10 mg tonight.', []))],
      ['a malformed envelope', generated('Sure! Here is what I think: ...')],
      ['an empty answer', generated(envelope('   ', []))],
      ['a provider outage', providerDown()],
    ];

    it.each(paths)(
      'returns non-empty text and a queryable status for %s',
      async (_name, dispatch) => {
        const { finalizer } = build();

        const response = await finalizer.validate(
          dispatch,
          retrieval,
          PROMPT_VERSION,
          context,
        );

        expect(response.text.trim().length).toBeGreaterThan(0);
        expect(['accepted', 'rejected_fallback']).toContain(
          response.validationStatus,
        );
        expect(response.promptVersion).toBe(PROMPT_VERSION);
      },
    );

    it('falls back to the generic referral when the run had no safety check', async () => {
      const { finalizer } = build();

      const response = await finalizer.validate(
        generated(envelope('Take 10 mg tonight.', [])),
        retrieval,
        PROMPT_VERSION,
        { intent: 'medication_question', patientId: 1002, safety: null },
      );

      expect(response.validationStatus).toBe('rejected_fallback');
      expect(response.text).toContain(
        'Your doctor or pharmacist can answer questions about your medicines.',
      );
    });

    it('delivers the answer even when retention fails', async () => {
      const exploding: RejectedCandidateStorePort = {
        retain: () => Promise.reject(new Error('review store is down')),
      };
      const { finalizer } = build(exploding);

      const response = await finalizer.validate(
        generated(envelope('Take 10 mg tonight.', [])),
        retrieval,
        PROMPT_VERSION,
        context,
      );

      expect(response.text).toContain('Medicine interaction');
      expect(response.validationStatus).toBe('rejected_fallback');
    });
  });
});

describe('InMemoryRejectedCandidateStore', () => {
  function record(index: number): RejectedCandidate {
    return {
      patientId: 1,
      intent: 'explain_finding',
      promptVersion: PROMPT_VERSION,
      reason: 'validation_rejected',
      candidateText: `candidate ${index}`,
      citedIds: [],
      suppliedCitationIds: [],
      violations: [],
      rejectedAt: new Date().toISOString(),
    };
  }

  it('hands back the newest refusals first', async () => {
    const store = new InMemoryRejectedCandidateStore();

    await store.retain(record(1));
    await store.retain(record(2));

    expect(store.list().map((entry) => entry.candidateText)).toEqual([
      'candidate 2',
      'candidate 1',
    ]);
  });

  it('stays bounded, dropping the oldest rather than growing without limit', async () => {
    const store = new InMemoryRejectedCandidateStore();

    for (let index = 0; index < 250; index += 1) {
      await store.retain(record(index));
    }

    expect(store.size).toBe(200);
    expect(store.list()[0].candidateText).toBe('candidate 249');
    expect(store.list()[199].candidateText).toBe('candidate 50');
  });
});
