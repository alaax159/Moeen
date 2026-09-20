import { Injectable } from '@nestjs/common';

import { DatabaseRepository } from '../../database/repository/database.repository';
import { DoseScheduleService } from '../../notifications/dose-notification-queue/dose-schedule.service';

@Injectable()
export class ArchiveMedicationService {
  constructor(
    private readonly databaseRepository: DatabaseRepository,
    private readonly doseScheduleService: DoseScheduleService,
  ) {}

  async archive(id: number, firebaseUid: string) {
    const result = await this.databaseRepository.archiveUserMedication(
      id,
      firebaseUid,
    );
    await this.doseScheduleService.cancelUserMedication(id);
    return result;
  }
}
