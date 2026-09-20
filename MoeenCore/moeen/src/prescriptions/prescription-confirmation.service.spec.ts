import { BadRequestException, Logger } from '@nestjs/common';

import { ConfirmPrescriptionItemStatus } from './dto/confirm-prescription-response.dto';
import { ConfirmPrescriptionDto } from './dto/confirm-prescription.dto';
import { PrescriptionConfirmationService } from './prescription-confirmation.service';

function medication(genericName: string, acknowledgeWarnings = false) {
  return {
    source: 'manual',
    medication: { genericName },
    userMedication: {
      frequency: 1,
      dosageAmount: 500,
      dosageUnit: 'mg',
      dosageForm: 'Tablet',
      durationOption: '1_week',
    },
    scheduleTimes: ['08:00'],
    ...(acknowledgeWarnings ? { acknowledgeWarnings: true } : {}),
  };
}

function dtoFor(...items: ReturnType<typeof medication>[]) {
  return { medications: items } as unknown as ConfirmPrescriptionDto;
}

const safe = { safe: true, warnings: [], duplicateMedication: null };

function created(id: number) {
  return { medicationId: 1, userMedication: { id }, scheduleTimes: [] };
}

describe('PrescriptionConfirmationService', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('adds every reviewed medication through the existing add flow', async () => {
    const addMedicationService = {
      checkSafety: jest.fn().mockResolvedValue(safe),
      create: jest
        .fn()
        .mockResolvedValueOnce(created(11))
        .mockResolvedValueOnce(created(12)),
    };
    const service = new PrescriptionConfirmationService(
      addMedicationService as never,
    );

    const result = await service.confirmPrescription(
      dtoFor(medication('Amoxicillin'), medication('Ibuprofen')),
      'uid-1',
    );

    expect(result.addedCount).toBe(2);
    expect(result.blockedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.results.map((item) => item.status)).toEqual([
      ConfirmPrescriptionItemStatus.ADDED,
      ConfirmPrescriptionItemStatus.ADDED,
    ]);
    expect(result.results.map((item) => item.userMedicationId)).toEqual([
      11, 12,
    ]);
    // The uid is forwarded so the medication lands on the caller's account.
    expect(addMedicationService.create).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'manual' }),
      'uid-1',
    );
  });

  it('runs the safety check for every medication before saving it', async () => {
    const addMedicationService = {
      checkSafety: jest.fn().mockResolvedValue(safe),
      create: jest.fn().mockResolvedValue(created(1)),
    };
    const service = new PrescriptionConfirmationService(
      addMedicationService as never,
    );

    await service.confirmPrescription(
      dtoFor(medication('Amoxicillin'), medication('Ibuprofen')),
      'uid-1',
    );

    expect(addMedicationService.checkSafety).toHaveBeenCalledTimes(2);
  });

  it('blocks a medication with warnings instead of saving it', async () => {
    const warnings = [
      { warningType: 'drug_allergy', severity: 'high', message: 'Allergy' },
    ];
    const addMedicationService = {
      checkSafety: jest.fn().mockResolvedValue({
        safe: false,
        warnings,
        duplicateMedication: null,
      }),
      create: jest.fn(),
    };
    const service = new PrescriptionConfirmationService(
      addMedicationService as never,
    );

    const result = await service.confirmPrescription(
      dtoFor(medication('Amoxicillin')),
      'uid-1',
    );

    expect(result.blockedCount).toBe(1);
    expect(result.addedCount).toBe(0);
    expect(result.results[0].warnings).toEqual(warnings);
    expect(addMedicationService.create).not.toHaveBeenCalled();
  });

  it('blocks a medication that duplicates an active one', async () => {
    const duplicateMedication = {
      userMedicationId: 7,
      medicationId: 3,
      name: 'Amoxicillin',
    };
    const addMedicationService = {
      checkSafety: jest
        .fn()
        .mockResolvedValue({ safe: true, warnings: [], duplicateMedication }),
      create: jest.fn(),
    };
    const service = new PrescriptionConfirmationService(
      addMedicationService as never,
    );

    const result = await service.confirmPrescription(
      dtoFor(medication('Amoxicillin')),
      'uid-1',
    );

    expect(result.results[0].status).toBe(
      ConfirmPrescriptionItemStatus.BLOCKED,
    );
    expect(result.results[0].duplicateMedication).toEqual(duplicateMedication);
    expect(addMedicationService.create).not.toHaveBeenCalled();
  });

  it('saves a warned medication once the user acknowledged the warnings', async () => {
    const warnings = [
      { warningType: 'drug_allergy', severity: 'high', message: 'Allergy' },
    ];
    const addMedicationService = {
      checkSafety: jest.fn().mockResolvedValue({
        safe: false,
        warnings,
        duplicateMedication: null,
      }),
      create: jest.fn().mockResolvedValue(created(21)),
    };
    const service = new PrescriptionConfirmationService(
      addMedicationService as never,
    );

    const result = await service.confirmPrescription(
      dtoFor(medication('Amoxicillin', true)),
      'uid-1',
    );

    expect(result.addedCount).toBe(1);
    expect(result.results[0].status).toBe(ConfirmPrescriptionItemStatus.ADDED);
    // The check still ran; acknowledgement only decides whether to continue.
    expect(addMedicationService.checkSafety).toHaveBeenCalledTimes(1);
    expect(addMedicationService.create).toHaveBeenCalledTimes(1);
  });

  it('never forwards acknowledgeWarnings into the add-medication payload', async () => {
    const addMedicationService = {
      checkSafety: jest.fn().mockResolvedValue(safe),
      create: jest.fn().mockResolvedValue(created(1)),
    };
    const service = new PrescriptionConfirmationService(
      addMedicationService as never,
    );

    await service.confirmPrescription(
      dtoFor(medication('Amoxicillin', true)),
      'uid-1',
    );

    const [payload] = addMedicationService.create.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(payload).not.toHaveProperty('acknowledgeWarnings');
  });

  it('keeps saving the remaining medications when one fails', async () => {
    const addMedicationService = {
      checkSafety: jest.fn().mockResolvedValue(safe),
      create: jest
        .fn()
        .mockRejectedValueOnce(new BadRequestException('Invalid dosage'))
        .mockResolvedValueOnce(created(31)),
    };
    const service = new PrescriptionConfirmationService(
      addMedicationService as never,
    );

    const result = await service.confirmPrescription(
      dtoFor(medication('Amoxicillin'), medication('Ibuprofen')),
      'uid-1',
    );

    expect(result.failedCount).toBe(1);
    expect(result.addedCount).toBe(1);
    expect(result.results[0].status).toBe(ConfirmPrescriptionItemStatus.FAILED);
    expect(result.results[0].message).toBe('Invalid dosage');
    expect(result.results[1].status).toBe(ConfirmPrescriptionItemStatus.ADDED);
  });

  it('replaces unexpected failures with a generic message', async () => {
    const addMedicationService = {
      checkSafety: jest.fn().mockRejectedValue(new Error('socket hang up')),
      create: jest.fn(),
    };
    const service = new PrescriptionConfirmationService(
      addMedicationService as never,
    );

    const result = await service.confirmPrescription(
      dtoFor(medication('Amoxicillin')),
      'uid-1',
    );

    expect(result.results[0].status).toBe(ConfirmPrescriptionItemStatus.FAILED);
    expect(result.results[0].message).not.toContain('socket hang up');
  });

  it('reports results in submission order so the client can map them back', async () => {
    const addMedicationService = {
      checkSafety: jest.fn().mockResolvedValue(safe),
      create: jest.fn().mockResolvedValue(created(1)),
    };
    const service = new PrescriptionConfirmationService(
      addMedicationService as never,
    );

    const result = await service.confirmPrescription(
      dtoFor(
        medication('Amoxicillin'),
        medication('Ibuprofen'),
        medication('Metformin'),
      ),
      'uid-1',
    );

    expect(result.results.map((item) => item.index)).toEqual([0, 1, 2]);
    expect(result.results.map((item) => item.name)).toEqual([
      'Amoxicillin',
      'Ibuprofen',
      'Metformin',
    ]);
  });
});
