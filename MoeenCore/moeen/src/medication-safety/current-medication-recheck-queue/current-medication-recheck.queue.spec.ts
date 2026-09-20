import type { Queue } from 'bullmq';

import { CurrentMedicationRecheckQueue } from './current-medication-recheck.queue';
import {
  CURRENT_MEDICATION_RECHECK_JOB,
  type CurrentMedicationRecheckJobData,
} from './current-medication-recheck-queue.constants';

describe('CurrentMedicationRecheckQueue', () => {
  it('enqueues the user recheck job', async () => {
    const add = jest.fn().mockResolvedValue(undefined);

    const service = new CurrentMedicationRecheckQueue({
      add,
    } as unknown as Queue<CurrentMedicationRecheckJobData>);

    await service.enqueue(7);

    expect(add).toHaveBeenCalledWith(CURRENT_MEDICATION_RECHECK_JOB, {
      userId: 7,
    });
  });

  it('does not propagate an enqueue failure to the health-profile request', async () => {
    const add = jest.fn().mockRejectedValue(new Error('redis unavailable'));

    const service = new CurrentMedicationRecheckQueue({
      add,
    } as unknown as Queue<CurrentMedicationRecheckJobData>);

    await expect(service.enqueue(7)).resolves.toBeUndefined();
  });
});
