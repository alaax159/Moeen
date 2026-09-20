import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';

import type { RetrievalResult } from '../../contracts';
import { retrievedChunkFixtures } from '../../__fixtures__';
import { envelope } from '../response-validator/response-validator.fixtures';
import { InMemoryRejectedCandidateStore } from './in-memory-rejected-candidate-store.service';
import { REJECTED_CANDIDATE_STORE } from './rejected-candidate-store.port';
import { ResponseFinalizerModule } from './response-finalizer.module';
import { ResponseFinalizer } from './response-finalizer.service';
import {
  VALIDATOR_PORT,
  type ValidatorPort,
} from '../../orchestrator/validator.port';

describe('ResponseFinalizerModule', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('resolves the whole validate stage through Nest, retention included', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ResponseFinalizerModule],
    }).compile();

    const finalizer = moduleRef.get(ResponseFinalizer);
    const validator = moduleRef.get<ValidatorPort>(VALIDATOR_PORT);
    const store = moduleRef.get<InMemoryRejectedCandidateStore>(
      REJECTED_CANDIDATE_STORE,
    );

    const retrieval: RetrievalResult = {
      found: true,
      chunks: [{ ...retrievedChunkFixtures.warfarinInteractions }],
    };

    const response = await finalizer.validate(
      {
        text: envelope('Take 10 mg at bedtime.', []),
        redactionCount: 0,
        outcome: 'generated',
      },
      retrieval,
      'gn1.1:missed_dose:with-evidence:00000000',
      { intent: 'missed_dose', patientId: 7, safety: null },
    );

    expect(response.validationStatus).toBe('rejected_fallback');
    expect(validator).toBe(finalizer);
    expect(response.text).toContain(
      'Your doctor or pharmacist is the right person to ask about a missed dose.',
    );
    expect(store.size).toBe(1);
  });
});
