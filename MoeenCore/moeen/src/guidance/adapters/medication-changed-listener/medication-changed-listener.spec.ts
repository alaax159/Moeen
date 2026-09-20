import { MedicationChangedListener } from './medication-changed-listener.service';
import { MedicationChangeEvent, MedicationChangeEventSource, GuidanceRunTrigger } from './medication-changed-listener.port';

describe('MedicationChangedListener', () => {
  it('triggers a guidance run when a simulated medication-change event fires', () => {
    let captured: ((event: MedicationChangeEvent) => void) | undefined;
    const fakeSource: MedicationChangeEventSource = { onChange: (listener) => { captured = listener; } };
    const fakeTrigger: GuidanceRunTrigger = { triggerGuidanceRun: jest.fn().mockResolvedValue(undefined) };

    new MedicationChangedListener(fakeSource, fakeTrigger).listen();
    captured?.({ userMedicationId: 42, trigger: 'added' });

    expect(fakeTrigger.triggerGuidanceRun).toHaveBeenCalledWith({ userMedicationId: 42, trigger: 'added' });
  });
});
