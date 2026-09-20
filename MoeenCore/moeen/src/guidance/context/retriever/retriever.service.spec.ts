import { patientScopeFixtures } from '../../__fixtures__/patient-scopes.fixture';
import { RetrieverService } from './retriever.service';
import { DETERMINISTIC_EMBEDDING_PROFILE } from '../../../knowledge/label-processing/embedding-provider';

function createChain(resolvedRows: unknown[]) {
  const chain: Record<string, jest.Mock> = {};
  for (const method of ['from', 'innerJoin', 'where', 'orderBy']) {
    chain[method] = jest.fn().mockReturnValue(chain);
  }
  chain.limit = jest.fn().mockResolvedValue(resolvedRows);
  return chain;
}

function mockDb(resolvedRows: unknown[] = []) {
  return { select: jest.fn().mockReturnValue(createChain(resolvedRows)) };
}

function mockEmbeddingProvider(vector: number[] = [0.1, 0.2, 0.3]) {
  const compatibleVector =
    vector.length === DETERMINISTIC_EMBEDDING_PROFILE.dimensions
      ? vector
      : Array.from(
          { length: DETERMINISTIC_EMBEDDING_PROFILE.dimensions },
          (_, index) => (index === 0 ? 1 : 0),
        );
  return {
    profile: DETERMINISTIC_EMBEDDING_PROFILE,
    embed: jest.fn().mockResolvedValue(compatibleVector),
  };
}

function mockConfigService(values: Record<string, string> = {}) {
  return { get: jest.fn((key: string) => values[key]) };
}

describe('RetrieverService', () => {
  it('returns no-evidence, and never queries or embeds, when the patient has no active medications', async () => {
    const db = mockDb();
    const embeddingProvider = mockEmbeddingProvider();
    const service = new RetrieverService(
      db as never,
      embeddingProvider,
      mockConfigService() as never,
    );

    const result = await service.retrieve({
      scope: { ...patientScopeFixtures.singleMedicationClear, medications: [] },
      intent: 'medication_question',
      sections: ['warnings'],
      question: 'does this interact with anything',
    });

    expect(result).toEqual({ found: false });
    expect(db.select).not.toHaveBeenCalled();
    expect(embeddingProvider.embed).not.toHaveBeenCalled();
  });

  it('returns no-evidence, and never queries or embeds, when the intent has no target sections', async () => {
    const db = mockDb();
    const embeddingProvider = mockEmbeddingProvider();
    const service = new RetrieverService(
      db as never,
      embeddingProvider,
      mockConfigService() as never,
    );

    const result = await service.retrieve({
      scope: patientScopeFixtures.singleMedicationClear,
      intent: 'medication_question',
      sections: [],
      question: 'irrelevant',
    });

    expect(result).toEqual({ found: false });
    expect(db.select).not.toHaveBeenCalled();
    expect(embeddingProvider.embed).not.toHaveBeenCalled();
  });

  it('fails closed without embedding when an exact finding has no medication subjects', async () => {
    const db = mockDb();
    const embeddingProvider = mockEmbeddingProvider();
    const service = new RetrieverService(
      db as never,
      embeddingProvider,
      mockConfigService() as never,
    );

    await expect(
      service.retrieve({
        scope: patientScopeFixtures.interactionCase,
        intent: 'explain_finding',
        findingSubjectUserMedicationIds: [],
        sections: ['warnings', 'drug_interactions'],
      }),
    ).resolves.toEqual({ found: false });
    expect(db.select).not.toHaveBeenCalled();
    expect(embeddingProvider.embed).not.toHaveBeenCalled();
  });

  it('rejects invalid finding medication IDs before embedding or querying', async () => {
    const db = mockDb();
    const embeddingProvider = mockEmbeddingProvider();
    const service = new RetrieverService(
      db as never,
      embeddingProvider,
      mockConfigService() as never,
    );

    await expect(
      service.retrieve({
        scope: patientScopeFixtures.interactionCase,
        intent: 'explain_finding',
        findingSubjectUserMedicationIds: [101, -1],
        sections: ['warnings'],
      }),
    ).rejects.toThrow(/positive safe integers/i);
    expect(db.select).not.toHaveBeenCalled();
    expect(embeddingProvider.embed).not.toHaveBeenCalled();
  });

  it('can retrieve an immutable finding by its subjects even when those medicines are no longer in the active scope', async () => {
    const db = mockDb([]);
    const embeddingProvider = mockEmbeddingProvider();
    const service = new RetrieverService(
      db as never,
      embeddingProvider,
      mockConfigService() as never,
    );

    await service.retrieve({
      scope: { ...patientScopeFixtures.interactionCase, medications: [] },
      intent: 'explain_finding',
      findingSubjectUserMedicationIds: [101, 102],
      sections: ['warnings'],
    });

    expect(db.select).toHaveBeenCalledTimes(1);
    expect(embeddingProvider.embed).toHaveBeenCalledTimes(1);
  });

  it('returns the explicit no-evidence signal, not an empty chunks array, when the query resolves zero rows', async () => {
    const db = mockDb([]);
    const embeddingProvider = mockEmbeddingProvider();
    const service = new RetrieverService(
      db as never,
      embeddingProvider,
      mockConfigService() as never,
    );

    const result = await service.retrieve({
      scope: patientScopeFixtures.singleMedicationClear,
      intent: 'medication_question',
      sections: ['warnings'],
      question: 'is lisinopril safe',
    });

    expect(result).toEqual({ found: false });
    expect('chunks' in result).toBe(false);
  });

  it('embeds the given question and maps resolved rows to RetrievedChunk with a stable citationId derived from the row id', async () => {
    const db = mockDb([
      {
        id: 42,
        setId: 'setid-lisinopril-001',
        section: 'warnings',
        text: 'Monitor renal function.',
      },
    ]);
    const embeddingProvider = mockEmbeddingProvider();
    const service = new RetrieverService(
      db as never,
      embeddingProvider,
      mockConfigService() as never,
    );

    const result = await service.retrieve({
      scope: patientScopeFixtures.singleMedicationClear,
      intent: 'medication_question',
      sections: ['warnings'],
      question: 'is lisinopril safe',
    });

    expect(embeddingProvider.embed).toHaveBeenCalledWith('is lisinopril safe');
    expect(result).toEqual({
      found: true,
      chunks: [
        {
          citationId: 'label-chunk-42',
          setId: 'setid-lisinopril-001',
          section: 'warnings',
          text: 'Monitor renal function.',
        },
      ],
    });
  });

  it('fails before querying when the provider returns a vector outside its declared profile', async () => {
    const db = mockDb([]);
    const embeddingProvider = {
      profile: DETERMINISTIC_EMBEDDING_PROFILE,
      embed: jest.fn().mockResolvedValue([0.1, 0.2]),
    };
    const service = new RetrieverService(
      db as never,
      embeddingProvider,
      mockConfigService() as never,
    );

    await expect(
      service.retrieve({
        scope: patientScopeFixtures.singleMedicationClear,
        intent: 'medication_question',
        sections: ['warnings'],
        question: 'is lisinopril safe',
      }),
    ).rejects.toThrow(/returned 2 dimensions/i);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('embeds a derived default when question is omitted, instead of embedding nothing or throwing', async () => {
    const db = mockDb([]);
    const embeddingProvider = mockEmbeddingProvider();
    const service = new RetrieverService(
      db as never,
      embeddingProvider,
      mockConfigService() as never,
    );

    await service.retrieve({
      scope: patientScopeFixtures.singleMedicationClear,
      intent: 'medication_question',
      sections: ['warnings'],
    });

    expect(embeddingProvider.embed).toHaveBeenCalledWith(
      'general guidance about lisinopril',
    );
  });

  it('passes every row the query returns straight through — no additional filtering happens in JavaScript', async () => {
    const rows = [
      { id: 1, setId: 'setid-a', section: 'warnings', text: 'a' },
      { id: 2, setId: 'setid-a', section: 'drug_interactions', text: 'b' },
      { id: 3, setId: 'setid-a', section: 'warnings', text: 'c' },
    ];
    const db = mockDb(rows);
    const embeddingProvider = mockEmbeddingProvider();
    const service = new RetrieverService(
      db as never,
      embeddingProvider,
      mockConfigService() as never,
    );

    const result = await service.retrieve({
      scope: patientScopeFixtures.singleMedicationClear,
      intent: 'explain_finding',
      findingSubjectUserMedicationIds: [101],
      sections: ['warnings', 'drug_interactions'],
      question: 'anything',
    });

    expect(result.found).toBe(true);
    expect(result.found && result.chunks).toHaveLength(rows.length);
  });

  describe('config-driven k', () => {
    it('limits to the default k (8) when RETRIEVER_K is not configured', async () => {
      const db = mockDb([]);
      const service = new RetrieverService(
        db as never,
        mockEmbeddingProvider(),
        mockConfigService() as never,
      );

      await service.retrieve({
        scope: patientScopeFixtures.singleMedicationClear,
        intent: 'medication_question',
        sections: ['warnings'],
        question: 'x',
      });

      const chain = db.select.mock.results[0].value as { limit: jest.Mock };
      expect(chain.limit).toHaveBeenCalledWith(8);
    });

    it('uses RETRIEVER_K from config when set', async () => {
      const db = mockDb([]);
      const service = new RetrieverService(
        db as never,
        mockEmbeddingProvider(),
        mockConfigService({ RETRIEVER_K: '3' }) as never,
      );

      await service.retrieve({
        scope: patientScopeFixtures.singleMedicationClear,
        intent: 'medication_question',
        sections: ['warnings'],
        question: 'x',
      });

      const chain = db.select.mock.results[0].value as { limit: jest.Mock };
      expect(chain.limit).toHaveBeenCalledWith(3);
    });

    it('falls back to the default when RETRIEVER_K is not a positive number', async () => {
      const db = mockDb([]);
      const service = new RetrieverService(
        db as never,
        mockEmbeddingProvider(),
        mockConfigService({ RETRIEVER_K: 'not-a-number' }) as never,
      );

      await service.retrieve({
        scope: patientScopeFixtures.singleMedicationClear,
        intent: 'medication_question',
        sections: ['warnings'],
        question: 'x',
      });

      const chain = db.select.mock.results[0].value as { limit: jest.Mock };
      expect(chain.limit).toHaveBeenCalledWith(8);
    });
  });

  it('orders by section priority first and similarity distance second, not distance alone', async () => {
    const db = mockDb([]);
    const service = new RetrieverService(
      db as never,
      mockEmbeddingProvider(),
      mockConfigService() as never,
    );

    await service.retrieve({
      scope: patientScopeFixtures.singleMedicationClear,
      intent: 'explain_finding',
      findingSubjectUserMedicationIds: [101],
      sections: ['warnings', 'indications'],
      question: 'x',
    });

    const chain = db.select.mock.results[0].value as { orderBy: jest.Mock };
    // Two sort keys were passed — priority, then distance as the tiebreak —
    // not a single distance-only ORDER BY.
    expect(chain.orderBy).toHaveBeenCalledTimes(1);
    expect(chain.orderBy.mock.calls[0]).toHaveLength(2);
  });
});
