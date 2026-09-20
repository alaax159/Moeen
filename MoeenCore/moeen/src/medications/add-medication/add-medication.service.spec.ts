import 'reflect-metadata';

import { MedicationSafetyTriggerType } from '../../medication-safety/medication-safety.events';
import {
  AddMedicationDto,
  DurationOption,
  MedicationSource,
} from '../dto/add-medication.dto';
import { AddMedicationService } from './add-medication.service';

describe('AddMedicationService', () => {
  const createDto = () =>
    ({
      source: MedicationSource.EXISTING_DB,
      medication: {
        id: 1,
      },
      userMedication: {
        durationOption: DurationOption.ONGOING,
      },
      scheduleTimes: ['08:00'],
    }) as unknown as AddMedicationDto;

  describe('create', () => {
    it('inserts, schedules, and establishes an authoritative post-save safety run', async () => {
      const medicationRepository = {
        insert_user_medication: jest.fn().mockResolvedValue({
          userMedication: {
            id: 42,
          },
        }),
      };

      const doseScheduleService = {
        scheduleNewUserMedication: jest.fn().mockResolvedValue(undefined),
      };

      const medicationSafetyEvents = {
        emitTriggerAndWait: jest.fn().mockResolvedValue(undefined),
      };

      const service = new AddMedicationService(
        medicationRepository as never,
        doseScheduleService as never,
        medicationSafetyEvents as never,
        {
          getConceptByRxcui: jest.fn(),
        } as never,
      );

      const result = await service.create(createDto(), 'firebase-user');

      expect(medicationRepository.insert_user_medication).toHaveBeenCalled();

      expect(
        doseScheduleService.scheduleNewUserMedication,
      ).toHaveBeenCalledWith(42);

      expect(medicationSafetyEvents.emitTriggerAndWait).toHaveBeenCalledWith({
        userMedicationId: 42,
        trigger: MedicationSafetyTriggerType.ADD,
      });
      expect(
        doseScheduleService.scheduleNewUserMedication.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        medicationSafetyEvents.emitTriggerAndWait.mock.invocationCallOrder[0],
      );
      expect(result).toEqual({ userMedication: { id: 42 } });
    });

    it('does not schedule when creating the user medication fails', async () => {
      const medicationRepository = {
        insert_user_medication: jest
          .fn()
          .mockRejectedValue(new Error('Database error')),
      };

      const doseScheduleService = {
        scheduleNewUserMedication: jest.fn(),
      };

      const medicationSafetyEvents = {
        emitTriggerAndWait: jest.fn(),
      };

      const service = new AddMedicationService(
        medicationRepository as never,
        doseScheduleService as never,
        medicationSafetyEvents as never,
        {
          getConceptByRxcui: jest.fn(),
        } as never,
      );

      await expect(
        service.create(createDto(), 'firebase-user'),
      ).rejects.toThrow('Database error');

      expect(
        doseScheduleService.scheduleNewUserMedication,
      ).not.toHaveBeenCalled();

      expect(medicationSafetyEvents.emitTriggerAndWait).not.toHaveBeenCalled();
    });

    it('propagates scheduling failures', async () => {
      const medicationRepository = {
        insert_user_medication: jest.fn().mockResolvedValue({
          userMedication: {
            id: 42,
          },
        }),
      };

      const doseScheduleService = {
        scheduleNewUserMedication: jest
          .fn()
          .mockRejectedValue(new Error('Scheduling error')),
      };

      const medicationSafetyEvents = {
        emitTriggerAndWait: jest.fn(),
      };

      const service = new AddMedicationService(
        medicationRepository as never,
        doseScheduleService as never,
        medicationSafetyEvents as never,
        {
          getConceptByRxcui: jest.fn(),
        } as never,
      );

      await expect(
        service.create(createDto(), 'firebase-user'),
      ).rejects.toThrow('Scheduling error');

      expect(
        doseScheduleService.scheduleNewUserMedication,
      ).toHaveBeenCalledWith(42);

      expect(medicationSafetyEvents.emitTriggerAndWait).not.toHaveBeenCalled();
    });

    /**
     * The medication row is committed and its doses are scheduled before the
     * ADD trigger runs, and the insert transaction already enqueued durable
     * safety invalidation for it. Failing the request here would tell a client
     * its save failed when it did not, and a retry would create a second row.
     */
    it('still returns the created medication when the post-save safety run fails', async () => {
      const medicationRepository = {
        insert_user_medication: jest.fn().mockResolvedValue({
          userMedication: {
            id: 42,
          },
        }),
      };

      const doseScheduleService = {
        scheduleNewUserMedication: jest.fn().mockResolvedValue(undefined),
      };

      const medicationSafetyEvents = {
        emitTriggerAndWait: jest
          .fn()
          .mockRejectedValue(new Error('Safety engine unavailable')),
      };

      const service = new AddMedicationService(
        medicationRepository as never,
        doseScheduleService as never,
        medicationSafetyEvents as never,
        {
          getConceptByRxcui: jest.fn(),
        } as never,
      );

      await expect(
        service.create(createDto(), 'firebase-user'),
      ).resolves.toEqual({ userMedication: { id: 42 } });

      expect(medicationSafetyEvents.emitTriggerAndWait).toHaveBeenCalledWith({
        userMedicationId: 42,
        trigger: MedicationSafetyTriggerType.ADD,
      });
    });

    it('requires an RxCUI when adding an RxNorm medication', async () => {
      const medicationRepository = {
        insert_user_medication: jest.fn(),
      };

      const doseScheduleService = {
        scheduleNewUserMedication: jest.fn(),
      };

      const medicationSafetyEvents = {
        emitTriggerAndWait: jest.fn(),
      };

      const service = new AddMedicationService(
        medicationRepository as never,
        doseScheduleService as never,
        medicationSafetyEvents as never,
        {
          getConceptByRxcui: jest.fn(),
        } as never,
      );

      const dto = createDto();
      dto.source = MedicationSource.RXNORM;
      dto.medication = {
        genericName: 'amoxicillin',
      };

      await expect(service.create(dto, 'firebase-user')).rejects.toThrow(
        'medication.rxcui is required when source is rxnorm',
      );

      expect(
        medicationRepository.insert_user_medication,
      ).not.toHaveBeenCalled();

      expect(
        doseScheduleService.scheduleNewUserMedication,
      ).not.toHaveBeenCalled();
    });

    it('rejects an RxNorm medication when the supplied RxCUI is invalid', async () => {
      const medicationRepository = {
        insert_user_medication: jest.fn(),
      };

      const doseScheduleService = {
        scheduleNewUserMedication: jest.fn(),
      };

      const medicationSafetyEvents = {
        emitTriggerAndWait: jest.fn(),
      };

      const rxNormService = {
        getConceptByRxcui: jest.fn().mockResolvedValue(null),
      };

      const service = new AddMedicationService(
        medicationRepository as never,
        doseScheduleService as never,
        medicationSafetyEvents as never,
        rxNormService as never,
      );

      const dto = createDto();
      dto.source = MedicationSource.RXNORM;
      dto.medication = {
        genericName: 'amoxicillin',
        rxcui: '999999999',
      };

      await expect(service.create(dto, 'firebase-user')).rejects.toThrow(
        'medication.rxcui is not a valid RxNorm concept',
      );

      expect(rxNormService.getConceptByRxcui).toHaveBeenCalledWith('999999999');

      expect(
        medicationRepository.insert_user_medication,
      ).not.toHaveBeenCalled();

      expect(
        doseScheduleService.scheduleNewUserMedication,
      ).not.toHaveBeenCalled();
    });
  });

  describe('checkSafety', () => {
    it('returns the existing active medication when the same medication is already being taken', async () => {
      const medicationRepository = {
        getDraftSafetyContext: jest.fn().mockResolvedValue({
          userId: 7,
          medicationId: 1,
          dailyMedId: null,
          rxcui: null,
          brandName: 'Amoxicillin',
          genericName: 'amoxicillin',
          verificationSource: 'dailymed',
          verificationStatus: 'verified',
        }),
        getActiveMedicationsByUserId: jest.fn().mockResolvedValue([
          {
            id: 55,
            medicationId: 1,
            brandName: 'Amoxicillin',
            genericName: 'amoxicillin',
            medicationCatalogId: null,
            dailyMedId: null,
            rxcui: null,
          },
        ]),
      };

      const medicationSafetyEvents = {
        emitTriggerAndWait: jest.fn().mockResolvedValue({
          safe: true,
          warnings: [],
        }),
      };

      const service = new AddMedicationService(
        medicationRepository as never,
        {
          scheduleNewUserMedication: jest.fn(),
        } as never,
        medicationSafetyEvents as never,
        {
          getConceptByRxcui: jest.fn(),
        } as never,
      );

      const result = await service.checkSafety(createDto(), 'firebase-user');

      expect(result).toEqual({
        safe: true,
        warnings: [],
        duplicateMedication: {
          userMedicationId: 55,
          medicationId: 1,
          name: 'amoxicillin',
        },
      });
    });

    it('does not return a duplicate for a different active medication', async () => {
      const medicationRepository = {
        getDraftSafetyContext: jest.fn().mockResolvedValue({
          userId: 7,
          medicationId: 1,
          dailyMedId: null,
          rxcui: null,
          brandName: 'Amoxicillin',
          genericName: 'amoxicillin',
          verificationSource: 'dailymed',
          verificationStatus: 'verified',
        }),
        getActiveMedicationsByUserId: jest.fn().mockResolvedValue([
          {
            id: 55,
            medicationId: 2,
            brandName: 'Ibuprofen',
            genericName: 'ibuprofen',
            medicationCatalogId: null,
            dailyMedId: null,
            rxcui: null,
          },
        ]),
      };

      const medicationSafetyEvents = {
        emitTriggerAndWait: jest.fn().mockResolvedValue({
          safe: true,
          warnings: [],
        }),
      };

      const service = new AddMedicationService(
        medicationRepository as never,
        {
          scheduleNewUserMedication: jest.fn(),
        } as never,
        medicationSafetyEvents as never,
        {
          getConceptByRxcui: jest.fn(),
        } as never,
      );

      const result = await service.checkSafety(createDto(), 'firebase-user');

      expect(result.duplicateMedication).toBeNull();
    });

    it('resolves a draft identity and runs a PRECHECK, without inserting anything', async () => {
      const medicationRepository = {
        insert_user_medication: jest.fn(),
        getDraftSafetyContext: jest.fn().mockResolvedValue({
          userId: 7,
          medicationId: 1,
          dailyMedId: null,
          brandName: 'PROPRANOLOL',
          genericName: null,
          verificationSource: 'dailymed',
          verificationStatus: 'verified',
        }),
        getActiveMedicationsByUserId: jest.fn().mockResolvedValue([]),
      };

      const doseScheduleService = {
        scheduleNewUserMedication: jest.fn(),
      };

      const medicationSafetyEvents = {
        emitTriggerAndWait: jest.fn().mockResolvedValue({
          safe: false,
          warnings: [
            {
              warningType: 'drug_condition',
              severity: 'unknown',
              message: 'example warning',
            },
          ],
        }),
      };

      const service = new AddMedicationService(
        medicationRepository as never,
        doseScheduleService as never,
        medicationSafetyEvents as never,
        {
          getConceptByRxcui: jest.fn(),
        } as never,
      );

      const result = await service.checkSafety(createDto(), 'firebase-user');

      expect(
        medicationRepository.insert_user_medication,
      ).not.toHaveBeenCalled();

      expect(
        doseScheduleService.scheduleNewUserMedication,
      ).not.toHaveBeenCalled();

      expect(medicationRepository.getDraftSafetyContext).toHaveBeenCalledWith(
        createDto(),
        'firebase-user',
      );

      expect(medicationSafetyEvents.emitTriggerAndWait).toHaveBeenCalledWith({
        trigger: MedicationSafetyTriggerType.PRECHECK,
        draft: {
          userId: 7,
          medicationId: 1,
          dailyMedId: null,
          brandName: 'PROPRANOLOL',
          genericName: null,
          verificationSource: 'dailymed',
          verificationStatus: 'verified',
        },
      });

      expect(result).toEqual({
        safe: false,
        warnings: [
          {
            warningType: 'drug_condition',
            severity: 'unknown',
            message: 'example warning',
          },
        ],
        duplicateMedication: null,
      });
    });
  });
});
