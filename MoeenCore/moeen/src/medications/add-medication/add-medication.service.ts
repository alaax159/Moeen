import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MedicationSafetyEventsService } from '../../medication-safety/medication-safety-events.service';
import { MedicationSafetyTriggerType } from '../../medication-safety/medication-safety.events';
import { RxNormService } from '../../medication-safety/rxnorm/rxnorm.service';

import {
  AddMedicationDto,
  DurationOption,
  MedicationSource,
  TIME_RE,
} from '../dto/add-medication.dto';
import { DatabaseRepository } from '../../database/repository/database.repository';
import { DoseScheduleService } from '../../notifications/dose-notification-queue/dose-schedule.service';

@Injectable()
export class AddMedicationService {
  private readonly logger = new Logger(AddMedicationService.name);

  constructor(
    private readonly medicationRepository: DatabaseRepository,
    private readonly doseScheduleService: DoseScheduleService,
    private readonly medicationSafetyEvents: MedicationSafetyEventsService,
    private readonly rxNormService: RxNormService,
  ) {}

  // Runs the safety checks against a not-yet-saved medication, so the
  // frontend can warn the user and let them decide before anything is
  // written to the database. Nothing is persisted by this call.
  async checkSafety(dto: AddMedicationDto, firebaseUid: string) {
    this.validate(dto);

    await this.validateRxNormMedication(dto);

    const draft = await this.medicationRepository.getDraftSafetyContext(
      dto,
      firebaseUid,
    );

    const [safety, activeMedications] = await Promise.all([
      this.medicationSafetyEvents.emitTriggerAndWait({
        trigger: MedicationSafetyTriggerType.PRECHECK,
        draft,
      }),
      this.medicationRepository.getActiveMedicationsByUserId(draft.userId),
    ]);

    const duplicateMedication = this.findDuplicateMedication(
      dto,
      draft,
      activeMedications,
    );

    return {
      ...(safety ?? { safe: true, warnings: [] }),
      duplicateMedication,
    };
  }

  async create(dto: AddMedicationDto, firebaseUid: string) {
    this.validate(dto);

    await this.validateRxNormMedication(dto);

    const scheduleTimes = this.normalizeScheduleTimes(dto.scheduleTimes);
    const { startDate, endDate } = this.resolveDates(dto.userMedication);

    const dailyMedId =
      dto.source === MedicationSource.DAILYMED
        ? this.toDailyMedId(dto.medication.dailymedId!)
        : null;

    const result = await this.medicationRepository.insert_user_medication(
      dto,
      {
        dailyMedId,
        scheduleTimes,
        startDate,
        endDate,
      },
      firebaseUid,
    );
    await this.doseScheduleService.scheduleNewUserMedication(
      result.userMedication.id,
    );

    // Deliberately not fatal. By this point the medication row is committed
    // and its doses are scheduled, and the insert transaction already enqueued
    // durable safety invalidation for it — the outbox worker will run the
    // recheck whether or not this inline trigger succeeded. Rethrowing would
    // report a failed save that actually succeeded, and a client retry would
    // create a second medication.
    try {
      await this.medicationSafetyEvents.emitTriggerAndWait({
        userMedicationId: result.userMedication.id,
        trigger: MedicationSafetyTriggerType.ADD,
      });
    } catch (error) {
      this.logger.error(
        `Post-save safety run failed for user medication ${result.userMedication.id}; the queued recheck remains responsible for it`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return result;
  }

  private findDuplicateMedication(
    dto: AddMedicationDto,
    draft: {
      medicationId: number | null;
      dailyMedId: string | null;
      rxcui?: string | null;
      brandName: string | null;
      genericName: string | null;
    },
    activeMedications: Array<{
      id: number;
      medicationId: number;
      brandName: string | null;
      genericName: string | null;
      medicationCatalogId: number | null;
      dailyMedId: string | null;
      rxcui: string | null;
    }>,
  ) {
    const duplicate = activeMedications.find((medication) => {
      if (
        dto.source === MedicationSource.EXISTING_DB &&
        draft.medicationId !== null
      ) {
        return medication.medicationId === draft.medicationId;
      }

      if (dto.source === MedicationSource.RXNORM && draft.rxcui?.trim()) {
        return medication.rxcui === draft.rxcui.trim();
      }

      if (
        dto.source === MedicationSource.DAILYMED &&
        dto.medication.dailymedId?.trim()
      ) {
        const dailyMedId = this.toDailyMedId(dto.medication.dailymedId.trim());
        return medication.dailyMedId === dailyMedId;
      }

      if (
        dto.source === MedicationSource.PALESTINE_MOH &&
        dto.medication.medicationCatalogId
      ) {
        return (
          medication.medicationCatalogId === dto.medication.medicationCatalogId
        );
      }

      if (dto.source === MedicationSource.MANUAL) {
        const candidateName = this.normalizeMedicationName(
          draft.genericName ?? draft.brandName,
        );

        if (!candidateName) {
          return false;
        }

        return [medication.genericName, medication.brandName].some(
          (name) => this.normalizeMedicationName(name) === candidateName,
        );
      }

      return false;
    });

    if (!duplicate) {
      return null;
    }

    return {
      userMedicationId: duplicate.id,
      medicationId: duplicate.medicationId,
      name:
        duplicate.genericName ??
        duplicate.brandName ??
        draft.genericName ??
        draft.brandName ??
        'Medication',
    };
  }

  private normalizeMedicationName(name: string | null | undefined) {
    return name?.trim().toLocaleLowerCase().replace(/\s+/g, ' ') ?? '';
  }

  private validate(dto: AddMedicationDto) {
    const { source, medication, userMedication } = dto;

    if (source === MedicationSource.EXISTING_DB && !medication.id) {
      throw new BadRequestException(
        'medication.id is required when source is existing_db',
      );
    }

    if (source === MedicationSource.DAILYMED && !medication.dailymedId) {
      throw new BadRequestException(
        'medication.dailymedId is required when source is dailymed',
      );
    }

    if (source === MedicationSource.RXNORM && !medication.rxcui?.trim()) {
      throw new BadRequestException(
        'medication.rxcui is required when source is rxnorm',
      );
    }

    if (
      source === MedicationSource.PALESTINE_MOH &&
      !medication.medicationCatalogId
    ) {
      throw new BadRequestException(
        'medication.medicationCatalogId is required when source is palestine_moh',
      );
    }

    if (
      source === MedicationSource.MANUAL &&
      !medication.brandName &&
      !medication.genericName
    ) {
      throw new BadRequestException(
        'medication.brandName or medication.genericName is required when source is manual',
      );
    }

    if (
      userMedication.durationOption === DurationOption.CUSTOM &&
      !userMedication.customDays
    ) {
      throw new BadRequestException(
        'userMedication.customDays is required when durationOption is custom',
      );
    }
  }

  private async validateRxNormMedication(dto: AddMedicationDto): Promise<void> {
    if (dto.source !== MedicationSource.RXNORM) {
      return;
    }

    const rxcui = dto.medication.rxcui?.trim();

    if (!rxcui) {
      return;
    }

    const concept = await this.rxNormService.getConceptByRxcui(rxcui);

    if (!concept) {
      throw new BadRequestException(
        'medication.rxcui is not a valid RxNorm concept',
      );
    }

    dto.medication.rxcui = concept.rxcui;
  }

  private normalizeScheduleTimes(rawTimes: string[]): string[] {
    const normalized = rawTimes.map((raw) => {
      const match = TIME_RE.exec(raw)!;
      const [, hours, minutes, , seconds] = match;
      return `${hours}:${minutes}:${seconds ?? '00'}`;
    });

    return Array.from(new Set(normalized));
  }

  private resolveDates(userMedication: AddMedicationDto['userMedication']) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(start);
    switch (userMedication.durationOption) {
      case DurationOption.THREE_DAYS:
        end.setUTCDate(end.getUTCDate() + 3);
        break;
      case DurationOption.ONE_WEEK:
        end.setUTCDate(end.getUTCDate() + 7);
        break;
      case DurationOption.TWO_WEEKS:
        end.setUTCDate(end.getUTCDate() + 14);
        break;
      case DurationOption.ONE_MONTH:
        end.setUTCMonth(end.getUTCMonth() + 1);
        break;
      case DurationOption.ONGOING:
        return {
          startDate: this.toDateString(start),
          endDate: null,
        };
      case DurationOption.CUSTOM:
        end.setUTCDate(end.getUTCDate() + userMedication.customDays!);
        break;
    }
    end.setUTCDate(end.getUTCDate() - 1);

    return {
      startDate: this.toDateString(start),
      endDate: this.toDateString(end),
    };
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private toDailyMedId(setId: string): string {
    return `dm/${setId}`;
  }
}
