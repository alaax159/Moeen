import { ListMedicationService } from './list-medication.service';

describe('ListMedicationService.getTodayDoses', () => {
  const cachedRow = {
    text: 'Missing an occasional dose is usually not dangerous, but check with your pharmacist if you are unsure.',
    citations: ['chunk-1'],
    validationStatus: 'accepted' as const,
  };

  function buildService() {
    const databaseRepository = {
      getTodayMedications: jest.fn().mockResolvedValue([
        {
          id: 1,
          brandName: 'Warfarin',
          genericName: 'warfarin',
          dosageAmount: '5',
          dosageUnit: 'mg',
          dosageForm: 'tablet',
          instructions: null,
          todaySchedule: [
            { scheduleTimeId: 10, time: '08:00:00', status: 'upcoming', snoozeCount: 0 },
            { scheduleTimeId: 11, time: '09:00:00', status: 'taken', snoozeCount: 0 },
            { scheduleTimeId: 12, time: '10:00:00', status: 'missed', snoozeCount: 0 },
            { scheduleTimeId: 13, time: '11:00:00', status: 'missed', snoozeCount: 0 },
          ],
        },
      ]),
    };

    const doseScheduleService = {};

    const guidanceMessageRepository = {
      findForScheduleTimeToday: jest.fn((scheduleTimeId: number) =>
        scheduleTimeId === 12 ? Promise.resolve(cachedRow) : Promise.resolve(null),
      ),
    };

    const service = new ListMedicationService(
      databaseRepository as any,
      doseScheduleService as any,
      guidanceMessageRepository as any,
    );

    return { service, databaseRepository, guidanceMessageRepository };
  }

  it('skips the guidance lookup entirely for an upcoming or taken dose, rather than nulling it out after querying', async () => {
    const { service, guidanceMessageRepository } = buildService();

    const doses = await service.getTodayDoses('firebase-uid');

    const upcoming = doses.find((dose) => dose.scheduleTimeId === 10);
    const taken = doses.find((dose) => dose.scheduleTimeId === 11);

    expect(upcoming?.guidance).toBeNull();
    expect(taken?.guidance).toBeNull();

    // Only the 2 missed doses (scheduleTimeId 12 and 13) should ever reach the
    // repository — if non-missed doses were queried and nulled afterward
    // instead of skipped, this count would be 4, not 2.
    expect(guidanceMessageRepository.findForScheduleTimeToday).toHaveBeenCalledTimes(2);
  });

  it('returns the real cached guidance for a missed dose with a cached message', async () => {
    const { service } = buildService();

    const doses = await service.getTodayDoses('firebase-uid');
    const missedWithCache = doses.find((dose) => dose.scheduleTimeId === 12);

    expect(missedWithCache?.guidance).toEqual(cachedRow);
  });

  it('returns guidance: null for a missed dose with nothing cached', async () => {
    const { service } = buildService();

    const doses = await service.getTodayDoses('firebase-uid');
    const missedWithoutCache = doses.find((dose) => dose.scheduleTimeId === 13);

    expect(missedWithoutCache?.guidance).toBeNull();
  });
});
