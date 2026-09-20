import { Logger } from '@nestjs/common';

import { MedicationSafetyEventsService } from './medication-safety-events.service';
import { MedicationSafetyTriggerType } from './medication-safety.events';

describe('MedicationSafetyEventsService', () => {
  it('delivers the medication safety trigger to registered listeners', () => {
    const service = new MedicationSafetyEventsService();
    const listener = jest.fn();

    service.onTrigger(listener);

    const event = {
      userMedicationId: 42,
      trigger: MedicationSafetyTriggerType.ADD,
    };

    service.emitTrigger(event);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(event);
  });

  it('delivers EDIT triggers correctly', () => {
    const service = new MedicationSafetyEventsService();
    const listener = jest.fn();

    service.onTrigger(listener);

    service.emitTrigger({
      userMedicationId: 51,
      trigger: MedicationSafetyTriggerType.EDIT,
    });

    expect(listener).toHaveBeenCalledWith({
      userMedicationId: 51,
      trigger: MedicationSafetyTriggerType.EDIT,
    });
  });

  it('handles rejected async listeners without throwing from emitTrigger', async () => {
    const service = new MedicationSafetyEventsService();

    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    service.onTrigger(() => Promise.reject(new Error('Router failed')));

    expect(() =>
      service.emitTrigger({
        userMedicationId: 42,
        trigger: MedicationSafetyTriggerType.ADD,
      }),
    ).not.toThrow();

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(loggerError).toHaveBeenCalledWith(
      'Medication safety trigger listener failed',
      expect.any(String),
    );

    loggerError.mockRestore();
  });

  it('handles synchronous listener errors without throwing from emitTrigger', () => {
    const service = new MedicationSafetyEventsService();

    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    service.onTrigger(() => {
      throw new Error('Listener failed');
    });

    expect(() =>
      service.emitTrigger({
        userMedicationId: 42,
        trigger: MedicationSafetyTriggerType.ADD,
      }),
    ).not.toThrow();

    expect(loggerError).toHaveBeenCalledWith(
      'Medication safety trigger listener failed',
      expect.any(String),
    );

    loggerError.mockRestore();
  });
});
