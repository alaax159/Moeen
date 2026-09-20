import { MedicationEventsService } from './medication-events.service';

describe('MedicationEventsService', () => {
  it('delivers an emitted event to a subscribed listener', () => {
    const service = new MedicationEventsService();
    const listener = jest.fn();

    service.onVerified(listener);
    service.emit({ medicationId: 1, dailyMedSetId: 'setid-1' });

    expect(listener).toHaveBeenCalledWith({
      medicationId: 1,
      dailyMedSetId: 'setid-1',
    });
  });

  it('does not deliver to a listener before it subscribes', () => {
    const service = new MedicationEventsService();
    const listener = jest.fn();

    service.emit({ medicationId: 1, dailyMedSetId: 'setid-1' });
    service.onVerified(listener);

    expect(listener).not.toHaveBeenCalled();
  });
});
