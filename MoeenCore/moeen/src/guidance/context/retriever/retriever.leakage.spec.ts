import { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { patientScopeFixtures } from '../../__fixtures__/patient-scopes.fixture';
import { RetrieverService } from './retriever.service';
import { DETERMINISTIC_EMBEDDING_PROFILE } from '../../../knowledge/label-processing/embedding-provider';

/**
 * A mocked db just returns whatever rows we hand it, regardless of what
 * WHERE clause was built — it can't prove the filter itself is safe, only
 * that mapping/short-circuit logic works (that's what retriever.service.spec
 * covers). Real leak-proofing here means capturing the actual SQL condition
 * object the service builds and rendering it to real SQL text + bound
 * params via drizzle's own PgDialect — the same rendering Postgres itself
 * would receive — then inspecting THAT for what could leak. The live
 * EXPLAIN ANALYZE run against a real pgvector container (see README) is
 * the complementary proof that Postgres actually enforces it.
 */
const dialect = new PgDialect();

function createChain(resolvedRows: unknown[]) {
  const chain: Record<string, jest.Mock> = {};
  for (const method of ['from', 'innerJoin', 'where', 'orderBy']) {
    chain[method] = jest.fn().mockReturnValue(chain);
  }
  chain.limit = jest.fn().mockResolvedValue(resolvedRows);
  return chain;
}

function mockDb(resolvedRows: unknown[] = []) {
  const chain = createChain(resolvedRows);
  return { db: { select: jest.fn().mockReturnValue(chain) }, chain };
}

function mockConfigService(values: Record<string, string> = {}) {
  return { get: jest.fn((key: string) => values[key]) };
}

const embeddingProvider = {
  profile: DETERMINISTIC_EMBEDDING_PROFILE,
  embed: () =>
    Promise.resolve(
      Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0)),
    ),
};
const clearSafetyContext = {
  safetyRunId: patientScopeFixtures.singleMedicationClear.safetyRunId,
  safetyCoverage: patientScopeFixtures.singleMedicationClear.safetyCoverage,
};

async function captureWhereClause(
  chain: ReturnType<typeof createChain>,
  service: RetrieverService,
  params: Parameters<RetrieverService['retrieve']>[0],
) {
  await service.retrieve(params);
  const calls = chain.where.mock.calls as SQL[][];
  const condition = calls[calls.length - 1][0];
  return dialect.sqlToQuery(condition);
}

describe('RetrieverService embedding profile fence', () => {
  it('filters on the exact active profile in the SQL safety boundary', async () => {
    const { db, chain } = mockDb();
    const service = new RetrieverService(
      db as never,
      embeddingProvider,
      mockConfigService() as never,
    );

    const { params } = await captureWhereClause(chain, service, {
      scope: patientScopeFixtures.singleMedicationClear,
      intent: 'medication_question',
      sections: ['warnings'],
      question: 'x',
    });

    expect(params).toEqual(
      expect.arrayContaining([
        DETERMINISTIC_EMBEDDING_PROFILE.model,
        DETERMINISTIC_EMBEDDING_PROFILE.version,
      ]),
    );
  });
});

describe('RetrieverService — leakage attempts', () => {
  it("attempt: rely on a wide default — the filter contains only the patient's own medications, never anything unlisted", async () => {
    const { db, chain } = mockDb();
    const service = new RetrieverService(
      db as never,
      embeddingProvider,
      mockConfigService() as never,
    );

    const { params } = await captureWhereClause(chain, service, {
      scope: {
        medications: [
          { ingredientName: 'lisinopril', frequency: 1, scheduleSlots: [] },
        ],
        conditions: [],
        allergies: [],
        ...clearSafetyContext,
        safetySeverity: 'clear',
        findings: [],
      },
      intent: 'medication_question',
      sections: ['warnings'],
      question: 'x',
    });

    expect(params).toContain('lisinopril');
    for (const other of ['warfarin', 'aspirin', 'metformin', 'ibuprofen']) {
      expect(params).not.toContain(other);
    }
  });

  it("attempt: reuse state across calls — two back-to-back calls for different patients never mix each other's medication filters", async () => {
    const { db, chain } = mockDb();
    const service = new RetrieverService(
      db as never,
      embeddingProvider,
      mockConfigService() as never,
    );

    const patientA = await captureWhereClause(chain, service, {
      scope: {
        medications: [
          { ingredientName: 'lisinopril', frequency: 1, scheduleSlots: [] },
        ],
        conditions: [],
        allergies: [],
        ...clearSafetyContext,
        safetySeverity: 'clear',
        findings: [],
      },
      intent: 'medication_question',
      sections: ['warnings'],
      question: 'x',
    });
    expect(patientA.params).not.toContain('warfarin');

    const patientB = await captureWhereClause(chain, service, {
      scope: {
        medications: [
          { ingredientName: 'warfarin', frequency: 1, scheduleSlots: [] },
        ],
        conditions: [],
        allergies: [],
        ...clearSafetyContext,
        safetySeverity: 'clear',
        findings: [],
      },
      intent: 'medication_question',
      sections: ['warnings'],
      question: 'x',
    });
    // Confirms the query is rebuilt fresh per call, not accumulated —
    // patient A's medication doesn't linger into patient B's filter.
    expect(patientB.params).toContain('warfarin');
    expect(patientB.params).not.toContain('lisinopril');
  });

  it('attempt: ask for a section outside the given list by relying on a wildcard — the section filter contains exactly what was asked for, nothing wider', async () => {
    const { db, chain } = mockDb();
    const service = new RetrieverService(
      db as never,
      embeddingProvider,
      mockConfigService() as never,
    );

    const { params } = await captureWhereClause(chain, service, {
      scope: {
        medications: [
          { ingredientName: 'lisinopril', frequency: 1, scheduleSlots: [] },
        ],
        conditions: [],
        allergies: [],
        ...clearSafetyContext,
        safetySeverity: 'clear',
        findings: [],
      },
      intent: 'medication_question',
      sections: ['warnings'],
      question: 'x',
    });

    expect(params).toContain('warnings');
    for (const other of [
      'indications',
      'dosage_and_administration',
      'contraindications',
      'adverse_reactions',
      'drug_interactions',
    ]) {
      expect(params).not.toContain(other);
    }
  });

  it('attempt: inject SQL through a malicious ingredient name — it lands as a bound parameter, never in the query text itself', async () => {
    const { db, chain } = mockDb();
    const service = new RetrieverService(
      db as never,
      embeddingProvider,
      mockConfigService() as never,
    );

    const malicious = "'; DROP TABLE label_chunk; --";
    const { sql, params } = await captureWhereClause(chain, service, {
      scope: {
        medications: [
          { ingredientName: malicious, frequency: 1, scheduleSlots: [] },
        ],
        conditions: [],
        allergies: [],
        ...clearSafetyContext,
        safetySeverity: 'clear',
        findings: [],
      },
      intent: 'medication_question',
      sections: ['warnings'],
      question: 'x',
    });

    // The raw string only ever appears as a bound value, never spliced
    // into the SQL text — the query text itself stays parameter
    // placeholders regardless of what the string contains.
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain(malicious);
    expect(params).toContain(malicious);
  });

  it('attempt: use subjectMedicationId to widen access — it has zero effect on the generated filter, present or absent', async () => {
    const { db, chain } = mockDb();
    const service = new RetrieverService(
      db as never,
      embeddingProvider,
      mockConfigService() as never,
    );

    const baseScope = {
      medications: [
        { ingredientName: 'lisinopril', frequency: 1, scheduleSlots: [] },
      ],
      conditions: [],
      allergies: [],
      ...clearSafetyContext,
      safetySeverity: 'clear' as const,
      findings: [],
    };

    const withoutSubject = await captureWhereClause(chain, service, {
      scope: baseScope,
      intent: 'medication_question',
      sections: ['warnings'],
      question: 'x',
    });

    const withSubject = await captureWhereClause(chain, service, {
      // subjectMedicationId is a user_medication.id, a different id space
      // from what the filter actually joins on (medication.generic_name)
      // — this asserts it isn't accidentally wired in as a bypass.
      scope: { ...baseScope, subjectMedicationId: 999999 },
      intent: 'medication_question',
      sections: ['warnings'],
      question: 'x',
    });

    expect(withSubject).toEqual(withoutSubject);
  });

  it('attempt: widen an exact finding to the whole regimen — SQL uses only the finding subject IDs', async () => {
    const { db, chain } = mockDb();
    const service = new RetrieverService(
      db as never,
      embeddingProvider,
      mockConfigService() as never,
    );

    const { sql, params } = await captureWhereClause(chain, service, {
      scope: patientScopeFixtures.interactionCase,
      intent: 'explain_finding',
      findingSubjectUserMedicationIds: [101, 102],
      sections: ['warnings', 'drug_interactions'],
      question: 'x',
    });

    expect(sql.toLowerCase()).toContain('exists');
    expect(sql).toContain('"user_medication"');
    expect(params).toEqual(expect.arrayContaining([101, 102]));
    expect(params).not.toEqual(
      expect.arrayContaining(['warfarin', 'aspirin', 'ibuprofen']),
    );
  });
});
