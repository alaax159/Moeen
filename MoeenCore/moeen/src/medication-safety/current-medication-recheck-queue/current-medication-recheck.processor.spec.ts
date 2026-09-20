import { CurrentMedicationRecheckService } from '../current-medication-recheck.service';
import { CurrentMedicationRecheckProcessor } from './current-medication-recheck.processor';
import {
  CURRENT_MEDICATION_RECHECK_JOB,
  CurrentMedicationRecheckJobData,
} from './current-medication-recheck-queue.constants';
import type { Job } from 'bullmq';

describe('CurrentMedicationRecheckProcessor', () => {
  it('runs the current medication recheck for the queued user', async () => {
    const recheckUser = jest.fn().mockResolvedValue(undefined);

    const processor = new CurrentMedicationRecheckProcessor({
      recheckUser,
    } as unknown as CurrentMedicationRecheckService);

    await processor.process({
      name: CURRENT_MEDICATION_RECHECK_JOB,
      data: { userId: 7 },
    } as Job<CurrentMedicationRecheckJobData>);

    expect(recheckUser).toHaveBeenCalledWith(7);
  });

  it('propagates worker failures so BullMQ can retry the job', async () => {
    const failure = new Error('RxNorm unavailable');
    const recheckUser = jest.fn().mockRejectedValue(failure);

    const processor = new CurrentMedicationRecheckProcessor({
      recheckUser,
    } as unknown as CurrentMedicationRecheckService);

    await expect(
      processor.process({
        name: CURRENT_MEDICATION_RECHECK_JOB,
        data: { userId: 7 },
      } as Job<CurrentMedicationRecheckJobData>),
    ).rejects.toBe(failure);
  });
});
