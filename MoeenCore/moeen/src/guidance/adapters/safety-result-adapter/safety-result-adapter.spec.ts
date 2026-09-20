import { SafetyResultAdapter } from './safety-result-adapter.service';
import {
  PersistedSafetyRun,
  SafetyEngineRepository,
} from './safety-engine.repository';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const CHECKER_ID = '22222222-2222-4222-8222-222222222222';
const FINDING_ID = '33333333-3333-4333-8333-333333333333';

function persistedRun(
  overrides: Partial<PersistedSafetyRun> = {},
): PersistedSafetyRun {
  const checkedAt = new Date('2026-08-01T00:00:00.000Z');
  return {
    run: {
      id: RUN_ID,
      userId: 42,
      subjectUserMedicationId: 10,
      trigger: 'medication_added',
      requiredChecks: ['drug_drug'],
      outcome: 'findings',
      coverageStatus: 'complete',
      engineVersion: 'test-v1',
      datasetVersions: { ddinter: '2026-08' },
      contextSnapshot: { activeUserMedicationIds: [10, 11] },
      contextHash: 'context-hash',
      contextVersion: 3,
      idempotencyKey: 'add:10',
      startedAt: checkedAt,
      completedAt: checkedAt,
      createdAt: checkedAt,
    },
    checkerResults: [
      {
        id: CHECKER_ID,
        runId: RUN_ID,
        checkerType: 'drug_drug',
        status: 'verified',
        reasonCode: null,
        datasetVersions: { ddinter: '2026-08' },
        checkedAt,
      },
    ],
    findings: [
      {
        id: FINDING_ID,
        checkerResultId: CHECKER_ID,
        findingType: 'drug_interaction',
        severity: 'major',
        rationale: 'Interaction rationale.',
        affected: null,
        primaryUserMedicationId: 10,
        interactingUserMedicationId: 11,
        subjectUserAllergyId: null,
        subjectUserConditionId: null,
        findingKey: 'finding-key',
        createdAt: checkedAt,
      },
    ],
    evidence: [
      {
        id: 1,
        checkerResultId: CHECKER_ID,
        findingId: FINDING_ID,
        source: 'ddinter',
        sourceRecordId: 'pair-1',
        sourceVersion: '2026-08',
        section: null,
        uri: null,
        contentHash: null,
        details: null,
        retrievedAt: checkedAt,
      },
    ],
    ...overrides,
  };
}

function buildRepository(record: PersistedSafetyRun | null) {
  return {
    findLatestRunForPatient: jest.fn().mockResolvedValue(record),
    findLatestRunForMedication: jest.fn().mockResolvedValue(record),
    findCurrentRunForPatient: jest.fn().mockResolvedValue(record),
    findRunById: jest.fn().mockResolvedValue(record),
    findFindingById: jest.fn().mockResolvedValue(record),
  };
}

describe('SafetyResultAdapter', () => {
  it('does not claim clear when no persisted run exists', async () => {
    const repo = buildRepository(null);
    const adapter = new SafetyResultAdapter(
      repo as unknown as SafetyEngineRepository,
    );

    await expect(adapter.getLatestForPatient(42)).resolves.toMatchObject({
      patientId: 42,
      severity: 'unverified',
      outcome: 'unverified',
      coverage: { status: 'partial', checks: [] },
      findings: [],
    });
  });

  it('maps an immutable run, exact subjects, coverage, and evidence', async () => {
    const repo = buildRepository(persistedRun());
    const adapter = new SafetyResultAdapter(
      repo as unknown as SafetyEngineRepository,
    );

    const result = await adapter.getLatestForPatient(42);

    expect(result).toMatchObject({
      runId: RUN_ID,
      patientId: 42,
      subjectUserMedicationId: 10,
      coverage: {
        status: 'complete',
        checks: [
          expect.objectContaining({
            checkerType: 'drug_drug',
            status: 'verified',
          }),
        ],
      },
      outcome: 'findings',
      severity: 'major',
      findings: [
        expect.objectContaining({
          id: FINDING_ID,
          subjectUserMedicationIds: [10, 11],
          evidence: [
            expect.objectContaining({
              source: 'ddinter',
              sourceRecordId: 'pair-1',
            }),
          ],
        }),
      ],
    });
  });

  it('loads the latest current run scoped to the requested medication', async () => {
    const repo = buildRepository(persistedRun());
    const adapter = new SafetyResultAdapter(
      repo as unknown as SafetyEngineRepository,
    );

    await expect(adapter.getLatestForMedication(42, 10)).resolves.toMatchObject(
      {
        runId: RUN_ID,
        patientId: 42,
        subjectUserMedicationId: 10,
      },
    );
    expect(repo.findLatestRunForMedication).toHaveBeenCalledWith(42, 10);
    expect(repo.findLatestRunForPatient).not.toHaveBeenCalled();
  });

  it('fails loudly if stored outcome metadata contradicts checker coverage', async () => {
    const record = persistedRun({
      run: { ...persistedRun().run, outcome: 'clear' },
    });
    const adapter = new SafetyResultAdapter(
      buildRepository(record) as unknown as SafetyEngineRepository,
    );

    await expect(adapter.getLatestForPatient(42)).rejects.toThrow(
      'violates its coverage/outcome invariant',
    );
  });

  it('loads an exact immutable run by UUID', async () => {
    const repo = buildRepository(persistedRun());
    const adapter = new SafetyResultAdapter(
      repo as unknown as SafetyEngineRepository,
    );

    await expect(adapter.getRunById(RUN_ID)).resolves.toMatchObject({
      runId: RUN_ID,
      severity: 'major',
    });
    expect(repo.findRunById).toHaveBeenCalledWith(RUN_ID);
  });

  it('loads an exact run only through the current-context repository fence', async () => {
    const repo = buildRepository(persistedRun());
    const adapter = new SafetyResultAdapter(
      repo as unknown as SafetyEngineRepository,
    );

    await expect(
      adapter.getCurrentRunForPatient(42, RUN_ID),
    ).resolves.toMatchObject({
      runId: RUN_ID,
      patientId: 42,
      severity: 'major',
    });
    expect(repo.findCurrentRunForPatient).toHaveBeenCalledWith(RUN_ID, 42);
    expect(repo.findLatestRunForPatient).not.toHaveBeenCalled();
    expect(repo.findRunById).not.toHaveBeenCalled();
  });

  it('returns explicit unverified safety when an exact run is stale or missing', async () => {
    const repo = buildRepository(null);
    const adapter = new SafetyResultAdapter(
      repo as unknown as SafetyEngineRepository,
    );

    await expect(
      adapter.getCurrentRunForPatient(42, RUN_ID),
    ).resolves.toMatchObject({
      patientId: 42,
      outcome: 'unverified',
      severity: 'unverified',
      coverage: { status: 'partial' },
    });
    expect(repo.findLatestRunForPatient).not.toHaveBeenCalled();
  });

  it('loads a current immutable finding without confusing its UUID with a run UUID', async () => {
    const repo = buildRepository(persistedRun());
    const adapter = new SafetyResultAdapter(
      repo as unknown as SafetyEngineRepository,
    );

    await expect(adapter.getFindingById(FINDING_ID, 42)).resolves.toMatchObject(
      {
        runId: RUN_ID,
        findings: [expect.objectContaining({ id: FINDING_ID })],
      },
    );
    expect(repo.findFindingById).toHaveBeenCalledWith(FINDING_ID, 42);
    expect(repo.findRunById).not.toHaveBeenCalled();
  });
});
