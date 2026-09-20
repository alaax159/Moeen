import type { SafetyRecheckOutboxRow } from './medication-safety-recheck-outbox.repository';
import { MedicationSafetyRecheckProcessor } from './medication-safety-recheck.processor';

function row(overrides: Partial<SafetyRecheckOutboxRow> = {}) {
  const now = new Date('2026-08-31T12:00:00.000Z');
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: 7,
    subjectUserMedicationId: 42,
    trigger: 'allergy_updated' as const,
    contextVersion: 3,
    idempotencyKey: 'queue-key',
    payload: {},
    status: 'processing' as const,
    attempts: 1,
    availableAt: now,
    lockedAt: now,
    processedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('MedicationSafetyRecheckProcessor', () => {
  it('routes a claimed row with a retry-safe key and completes it', async () => {
    const outbox = {
      claimBatch: jest.fn().mockResolvedValue([row()]),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn(),
    };
    const router = { route: jest.fn().mockResolvedValue({ runId: 'run-1' }) };
    const processor = new MedicationSafetyRecheckProcessor(
      outbox as never,
      router as never,
    );

    await processor.processBatch();

    expect(router.route).toHaveBeenCalledWith({
      type: 'allergy_updated',
      userMedicationId: 42,
      idempotencyKey: 'outbox:11111111-1111-4111-8111-111111111111',
    });
    expect(outbox.markCompleted).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('records a retry when a safety run fails', async () => {
    const queued = row({ attempts: 3 });
    const outbox = {
      claimBatch: jest.fn().mockResolvedValue([queued]),
      markCompleted: jest.fn(),
      recordFailure: jest.fn().mockResolvedValue(undefined),
    };
    const router = {
      route: jest.fn().mockRejectedValue(new Error('provider unavailable')),
    };
    const processor = new MedicationSafetyRecheckProcessor(
      outbox as never,
      router as never,
    );

    await processor.processBatch();

    expect(outbox.recordFailure).toHaveBeenCalledWith(
      queued.id,
      3,
      'provider unavailable',
      8,
    );
    expect(outbox.markCompleted).not.toHaveBeenCalled();
  });

  it('dead-letters event types that are not mutation invalidations', async () => {
    const queued = row({ trigger: 'medication_precheck' });
    const outbox = {
      claimBatch: jest.fn().mockResolvedValue([queued]),
      markCompleted: jest.fn(),
      recordFailure: jest.fn().mockResolvedValue(undefined),
    };
    const router = { route: jest.fn() };
    const processor = new MedicationSafetyRecheckProcessor(
      outbox as never,
      router as never,
    );

    await processor.processBatch();

    expect(router.route).not.toHaveBeenCalled();
    expect(outbox.recordFailure).toHaveBeenCalledWith(
      queued.id,
      8,
      'Unsupported safety invalidation trigger: medication_precheck',
      8,
    );
  });

  it('does not overlap polling intervals in one process', async () => {
    let release!: (rows: SafetyRecheckOutboxRow[]) => void;
    const pending = new Promise<SafetyRecheckOutboxRow[]>((resolve) => {
      release = resolve;
    });
    const outbox = {
      claimBatch: jest.fn().mockReturnValue(pending),
      markCompleted: jest.fn(),
      recordFailure: jest.fn(),
    };
    const processor = new MedicationSafetyRecheckProcessor(
      outbox as never,
      { route: jest.fn() } as never,
    );

    const first = processor.processBatch();
    await processor.processBatch();
    expect(outbox.claimBatch).toHaveBeenCalledTimes(1);

    release([]);
    await first;
  });
});
