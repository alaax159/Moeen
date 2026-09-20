import { MedicationSafetyTriggerType } from '../../medication-safety/medication-safety.events';
import { UpdateMedicationDto } from '../dto/update-medication.dto';
import { UpdateMedicationService } from './update-medication.service';

describe('UpdateMedicationService medication safety trigger', () => {
  const updateDto = () =>
    ({
      dosageAmount: 2,
    }) as unknown as UpdateMedicationDto;

  it('emits EDIT only after rescheduling succeeds', async () => {
    const databaseRepository = {
      updateUserMedication: jest.fn().mockResolvedValue({
        id: 51,
      }),
    };

    const doseScheduleService = {
      rescheduleUserMedication: jest.fn().mockResolvedValue(undefined),
    };

    const medicationSafetyEvents = {
      emitTrigger: jest.fn(),
    };

    const service = new UpdateMedicationService(
      databaseRepository as never,
      doseScheduleService as never,
      medicationSafetyEvents as never,
    );

    await service.update(51, updateDto(), 'firebase-user');

    expect(doseScheduleService.rescheduleUserMedication).toHaveBeenCalledWith(
      51,
    );

    expect(medicationSafetyEvents.emitTrigger).toHaveBeenCalledWith({
      userMedicationId: 51,
      trigger: MedicationSafetyTriggerType.EDIT,
    });

    expect(
      doseScheduleService.rescheduleUserMedication.mock.invocationCallOrder[0],
    ).toBeLessThan(
      medicationSafetyEvents.emitTrigger.mock.invocationCallOrder[0],
    );
  });

  it('does not emit when updating the user medication fails', async () => {
    const databaseRepository = {
      updateUserMedication: jest
        .fn()
        .mockRejectedValue(new Error('Database error')),
    };

    const doseScheduleService = {
      rescheduleUserMedication: jest.fn(),
    };

    const medicationSafetyEvents = {
      emitTrigger: jest.fn(),
    };

    const service = new UpdateMedicationService(
      databaseRepository as never,
      doseScheduleService as never,
      medicationSafetyEvents as never,
    );

    await expect(
      service.update(51, updateDto(), 'firebase-user'),
    ).rejects.toThrow('Database error');

    expect(doseScheduleService.rescheduleUserMedication).not.toHaveBeenCalled();

    expect(medicationSafetyEvents.emitTrigger).not.toHaveBeenCalled();
  });

  it('does not emit when rescheduling the medication fails', async () => {
    const databaseRepository = {
      updateUserMedication: jest.fn().mockResolvedValue({
        id: 51,
      }),
    };

    const doseScheduleService = {
      rescheduleUserMedication: jest
        .fn()
        .mockRejectedValue(new Error('Rescheduling error')),
    };

    const medicationSafetyEvents = {
      emitTrigger: jest.fn(),
    };

    const service = new UpdateMedicationService(
      databaseRepository as never,
      doseScheduleService as never,
      medicationSafetyEvents as never,
    );

    await expect(
      service.update(51, updateDto(), 'firebase-user'),
    ).rejects.toThrow('Rescheduling error');

    expect(doseScheduleService.rescheduleUserMedication).toHaveBeenCalledWith(
      51,
    );

    expect(medicationSafetyEvents.emitTrigger).not.toHaveBeenCalled();
  });
});
