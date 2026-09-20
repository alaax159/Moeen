import { MedicationSafetyEventsService } from './medication-safety-events.service';
import { MedicationSafetyTriggerType } from './medication-safety.events';
import { MedicationSafetyRouterService } from './medication-safety-router.service';
import { MedicationSafetyTriggerRouterListener } from './medication-safety-trigger-router.listener';

describe('MedicationSafetyTriggerRouterListener', () => {
  let eventsService: MedicationSafetyEventsService;
  let router: {
    route: jest.Mock;
  };

  beforeEach(() => {
    eventsService = new MedicationSafetyEventsService();

    router = {
      route: jest.fn().mockResolvedValue({
        safe: true,
        warnings: [],
      }),
    };

    new MedicationSafetyTriggerRouterListener(
      eventsService,
      router as unknown as MedicationSafetyRouterService,
    );
  });

  it.each([
    [MedicationSafetyTriggerType.ADD, 'medication_added'],
    [MedicationSafetyTriggerType.EDIT, 'medication_updated'],
    [MedicationSafetyTriggerType.MISSED, 'dose_missed'],
  ])('routes %s triggers as %s', async (trigger, type) => {
    await eventsService.emitTriggerAndWait({
      userMedicationId: 42,
      trigger,
    });

    expect(router.route).toHaveBeenCalledWith({
      type,
      userMedicationId: 42,
    });
  });

  it('propagates router failures for awaited triggers', async () => {
    router.route.mockRejectedValue(new Error('Router failed'));

    await expect(
      eventsService.emitTriggerAndWait({
        userMedicationId: 42,
        trigger: MedicationSafetyTriggerType.MISSED,
      }),
    ).rejects.toThrow('Router failed');
  });
});
