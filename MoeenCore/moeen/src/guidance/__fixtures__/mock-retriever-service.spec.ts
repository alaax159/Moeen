import { RetrieverPort } from '../context/retriever/retriever.port';
import { patientScopeFixtures } from './patient-scopes.fixture';
import {
  retrievalResultFixtures,
  retrievedChunkFixtures,
} from './retrieved-chunks.fixture';
import { MockRetrieverService } from './mock-retriever-service';

describe('MockRetrieverService', () => {
  it('takes zero dependencies — structurally incapable of touching a database', () => {
    // No constructor args to inject a db/embedding provider into means
    // this class cannot reach a database, by construction, not by promise.
    expect(MockRetrieverService.length).toBe(0);
  });

  it('returns retrievalResultFixtures.found by default', async () => {
    const port: RetrieverPort = new MockRetrieverService();

    const result = await port.retrieve({
      scope: patientScopeFixtures.singleMedicationClear,
      intent: 'medication_question',
      sections: ['warnings'],
      question: 'anything',
    });

    expect(result).toEqual(retrievalResultFixtures.found);
  });

  it('returns whatever setResult() was last configured with, ignoring the actual params passed to retrieve()', async () => {
    const mock = new MockRetrieverService();
    mock.setResult(retrievalResultFixtures.noEvidence);
    const port: RetrieverPort = mock;

    const result = await port.retrieve({
      scope: patientScopeFixtures.interactionCase,
      intent: 'explain_finding',
      findingSubjectUserMedicationIds: [101, 102],
      sections: ['drug_interactions', 'warnings'],
      question: 'is this dangerous',
    });

    expect(result).toEqual(retrievalResultFixtures.noEvidence);
  });

  it('can be configured with an arbitrary custom RetrievalResult, not just the two named fixtures', async () => {
    const mock = new MockRetrieverService();
    mock.setResult({
      found: true,
      chunks: [retrievedChunkFixtures.aspirinIndications],
    });
    const port: RetrieverPort = mock;

    const result = await port.retrieve({
      scope: patientScopeFixtures.singleMedicationClear,
      intent: 'medication_question',
      sections: ['indications'],
      question: 'x',
    });

    expect(result).toEqual({
      found: true,
      chunks: [retrievedChunkFixtures.aspirinIndications],
    });
  });
});
