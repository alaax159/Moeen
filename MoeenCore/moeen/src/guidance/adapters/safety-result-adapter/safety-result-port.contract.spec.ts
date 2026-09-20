import {
  MockSafetyResultAdapter,
  safetyCheckResultFixtures,
} from '../../__fixtures__';
import type { SafetyCheckResult } from '../../contracts';
import {
  PersistedSafetyRun,
  SafetyEngineRepository,
} from './safety-engine.repository';
import { SafetyResultAdapter } from './safety-result-adapter.service';
import { SafetyResultPort } from './safety-result-adapter.port';

type ScenarioKey = keyof typeof safetyCheckResultFixtures;
const SCENARIO_KEYS = Object.keys(safetyCheckResultFixtures) as ScenarioKey[];
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const CHECKER_ID = '22222222-2222-4222-8222-222222222222';

function persistedFromFixture(fixture: SafetyCheckResult): PersistedSafetyRun {
  const checkedAt = new Date(fixture.checkedAt);
  return {
    run: {
      id: RUN_ID,
      userId: fixture.patientId,
      subjectUserMedicationId: fixture.subjectUserMedicationId ?? 1,
      trigger: fixture.trigger,
      requiredChecks: ['drug_drug'],
      outcome: fixture.outcome,
      coverageStatus: fixture.coverage.status,
      engineVersion: fixture.engineVersion,
      datasetVersions: { ...fixture.datasetVersions },
      contextSnapshot: {},
      contextHash: fixture.contextHash,
      contextVersion: 0,
      idempotencyKey: `fixture:${fixture.id}`,
      startedAt: new Date(fixture.startedAt),
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
        datasetVersions: {},
        checkedAt,
      },
    ],
    findings: fixture.findings.map((finding, index) => ({
      id: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
      checkerResultId: CHECKER_ID,
      findingType: finding.type,
      severity: finding.severity,
      rationale: finding.rationale,
      affected: null,
      primaryUserMedicationId: finding.subjectUserMedicationIds[0],
      interactingUserMedicationId: finding.subjectUserMedicationIds[1] ?? null,
      subjectUserAllergyId: finding.subjectUserAllergyId ?? null,
      subjectUserConditionId: finding.subjectUserConditionId ?? null,
      findingKey: `finding-${index}`,
      createdAt: checkedAt,
    })),
    evidence: [],
  };
}

function runContractTests(
  implName: string,
  buildPort: (key: ScenarioKey) => SafetyResultPort,
) {
  describe(`SafetyResultPort contract — ${implName}`, () => {
    for (const key of SCENARIO_KEYS) {
      it(`${key}: getLatestForPatient matches the fixture`, async () => {
        const expected = safetyCheckResultFixtures[key];
        const result = await buildPort(key).getLatestForPatient(
          expected.patientId,
        );

        expect(result.severity).toBe(expected.severity);
        expect(result.outcome).toBe(expected.outcome);
        expect(result.findings).toHaveLength(expected.findings.length);
      });
    }

    it('getRunById returns null for an unknown run UUID', async () => {
      await expect(
        buildPort('clear').getRunById('99999999-9999-4999-8999-999999999999'),
      ).resolves.toBeNull();
    });

    it('getFindingById returns null for an unknown or stale finding', async () => {
      await expect(
        buildPort('clear').getFindingById(
          '99999999-9999-4999-8999-999999999999',
          safetyCheckResultFixtures.clear.patientId,
        ),
      ).resolves.toBeNull();
    });
  });
}

runContractTests('MockSafetyResultAdapter', (key) => {
  const mock = new MockSafetyResultAdapter();
  mock.setResult(safetyCheckResultFixtures[key]);
  return mock;
});

runContractTests('SafetyResultAdapter (persisted run)', (key) => {
  const record = persistedFromFixture(safetyCheckResultFixtures[key]);
  const repository = {
    findLatestRunForPatient: jest.fn().mockResolvedValue(record),
    findLatestRunForMedication: jest.fn().mockResolvedValue(record),
    findCurrentRunForPatient: jest.fn().mockResolvedValue(record),
    findRunById: jest.fn().mockResolvedValue(null),
    findFindingById: jest.fn().mockResolvedValue(null),
  };
  return new SafetyResultAdapter(
    repository as unknown as SafetyEngineRepository,
  );
});
