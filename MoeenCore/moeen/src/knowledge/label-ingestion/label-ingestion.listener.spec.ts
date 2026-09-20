import { Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

import { MedicationVerifiedEvent } from '../../medication-events/medication-verified.event';
import { MedicationEventsService } from '../../medication-events/medication-events.service';
import {
  FETCH_LABEL_JOB,
  FetchLabelJobData,
} from './label-ingestion-queue.constants';
import { LabelIngestionListener } from './label-ingestion.listener';

describe('LabelIngestionListener', () => {
  it('enqueues a job (returning immediately) when a medication is verified', async () => {
    let capturedListener:
      ((event: MedicationVerifiedEvent) => void) | undefined;
    const medicationEvents = {
      onVerified: jest.fn(
        (listener: (event: MedicationVerifiedEvent) => void) => {
          capturedListener = listener;
        },
      ),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };

    const listener = new LabelIngestionListener(
      medicationEvents as unknown as MedicationEventsService,
      queue as unknown as Queue<FetchLabelJobData>,
    );

    listener.onModuleInit();
    expect(medicationEvents.onVerified).toHaveBeenCalledTimes(1);

    capturedListener!({ medicationId: 42, dailyMedSetId: 'setid-abc' });

    // enqueue is fire-and-forget (void) from the caller's perspective —
    // flush microtasks before asserting.
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.add).toHaveBeenCalledWith(
      FETCH_LABEL_JOB,
      { medicationId: 42, dailyMedSetId: 'setid-abc' },
      { jobId: `${FETCH_LABEL_JOB}-setid-abc` },
    );
  });

  it('logs (does not throw as an unhandled rejection) when queue.add() itself fails', async () => {
    let capturedListener:
      ((event: MedicationVerifiedEvent) => void) | undefined;
    const medicationEvents = {
      onVerified: jest.fn(
        (listener: (event: MedicationVerifiedEvent) => void) => {
          capturedListener = listener;
        },
      ),
    };
    const queue = {
      add: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    };

    const listener = new LabelIngestionListener(
      medicationEvents as unknown as MedicationEventsService,
      queue as unknown as Queue<FetchLabelJobData>,
    );
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    listener.onModuleInit();
    capturedListener!({ medicationId: 42, dailyMedSetId: 'setid-abc' });

    await Promise.resolve();
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Redis unavailable'),
    );

    errorSpy.mockRestore();
  });
});
