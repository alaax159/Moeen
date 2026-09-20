import { BadRequestException, Injectable } from '@nestjs/common';

import { DatabaseRepository } from '../../database/repository/database.repository';
import { UpdateMedicationDto } from '../dto/update-medication.dto';
import { DurationOption } from '../dto/add-medication.dto';
import { DoseScheduleService } from '../../notifications/dose-notification-queue/dose-schedule.service';
import { MedicationSafetyEventsService } from '../../medication-safety/medication-safety-events.service';
import { MedicationSafetyTriggerType } from '../../medication-safety/medication-safety.events';

@Injectable()
export class UpdateMedicationService {
  constructor(
    private readonly databaseRepository: DatabaseRepository,
    private readonly doseScheduleService: DoseScheduleService,
    private readonly medicationSafetyEvents: MedicationSafetyEventsService,
  ) {}

  async update(id: number, dto: UpdateMedicationDto, firebaseUid: string) {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('At least one field is required');
    }

    if (
      dto.durationOption === DurationOption.CUSTOM &&
      dto.customDays === undefined
    ) {
      throw new BadRequestException(
        'customDays is required when durationOption is custom',
      );
    }

    if (dto.durationOption !== undefined && dto.endDate !== undefined) {
      throw new BadRequestException(
        'endDate cannot be used together with durationOption',
      );
    }

    if (dto.scheduleTimes !== undefined) {
      dto.scheduleTimes = this.normalizeScheduleTimes(dto.scheduleTimes);
    }

    const result = await this.databaseRepository.updateUserMedication(
      id,
      dto,
      firebaseUid,
    );

    await this.doseScheduleService.rescheduleUserMedication(id);

    this.medicationSafetyEvents.emitTrigger({
      userMedicationId: id,
      trigger: MedicationSafetyTriggerType.EDIT,
    });
    return result;
  }

  private normalizeScheduleTimes(rawTimes: string[]): string[] {
    return Array.from(
      new Set(
        rawTimes.map((raw) => {
          const [hours, minutes, seconds = '00'] = raw.split(':');
          return `${hours}:${minutes}:${seconds}`;
        }),
      ),
    );
  }
}
