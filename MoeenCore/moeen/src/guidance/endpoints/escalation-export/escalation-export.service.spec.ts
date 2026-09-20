import { DoseLogRepository } from '../../../database/repository/dose-log.repository';
import { UserMedicationRepository } from '../../../database/repository/user-medication.repository';
import { EscalationExportService } from './escalation-export.service';

function build() {
  const userMedicationRepository = {
    getCurrentMedicationsByUserId: jest.fn().mockResolvedValue([]),
  };
  const doseLogRepository = {
    getRecentDoseLogsByUserId: jest.fn().mockResolvedValue([]),
  };

  const service = new EscalationExportService(
    userMedicationRepository as unknown as UserMedicationRepository,
    doseLogRepository as unknown as DoseLogRepository,
  );

  return { service, userMedicationRepository, doseLogRepository };
}

const medicationRow = () => ({
  id: 11,
  brandName: 'Zestril',
  genericName: 'lisinopril',
  dosageAmount: '10',
  dosageUnit: 'mg',
  dosageForm: 'tablet',
  frequency: 1,
  instructions: 'with food',
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  scheduleTimes: ['08:00:00'],
  scheduleUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
});

const doseRow = () => ({
  userMedicationId: 11,
  brandName: 'Zestril',
  genericName: 'lisinopril',
  date: '2026-09-05',
  scheduledFor: new Date('2026-09-05T05:00:00.000Z'),
  status: 'taken' as const,
  markedAt: new Date('2026-09-05T05:03:00.000Z'),
});

describe('EscalationExportService', () => {
  it('issues both reads for the given user id', async () => {
    const { service, userMedicationRepository, doseLogRepository } = build();

    await service.getExport(42);

    expect(
      userMedicationRepository.getCurrentMedicationsByUserId,
    ).toHaveBeenCalledWith(42);
    expect(doseLogRepository.getRecentDoseLogsByUserId).toHaveBeenCalledWith(42);
  });

  it('returns empty arrays, not null, when the user has no data', async () => {
    const { service } = build();

    expect(await service.getExport(42)).toEqual({
      medications: [],
      recentDoses: [],
    });
  });

  it('maps medications to the response shape and drops internal fields', async () => {
    const { service, userMedicationRepository } = build();
    userMedicationRepository.getCurrentMedicationsByUserId.mockResolvedValue([
      medicationRow(),
    ]);

    const { medications } = await service.getExport(42);

    expect(medications).toEqual([
      {
        userMedicationId: 11,
        brandName: 'Zestril',
        genericName: 'lisinopril',
        dosageAmount: '10',
        dosageUnit: 'mg',
        dosageForm: 'tablet',
        frequency: 1,
        instructions: 'with food',
        scheduleTimes: ['08:00:00'],
      },
    ]);
  });

  it('serialises dose timestamps to ISO strings', async () => {
    const { service, doseLogRepository } = build();
    doseLogRepository.getRecentDoseLogsByUserId.mockResolvedValue([doseRow()]);

    const { recentDoses } = await service.getExport(42);

    expect(recentDoses).toEqual([
      {
        userMedicationId: 11,
        brandName: 'Zestril',
        genericName: 'lisinopril',
        date: '2026-09-05',
        scheduledFor: '2026-09-05T05:00:00.000Z',
        status: 'taken',
        markedAt: '2026-09-05T05:03:00.000Z',
      },
    ]);
  });
});
