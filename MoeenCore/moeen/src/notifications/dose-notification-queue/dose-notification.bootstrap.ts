import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { DatabaseRepository } from '../../database/repository/database.repository';
import { DoseScheduleService } from './dose-schedule.service';

@Injectable()
export class DoseNotificationBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(DoseNotificationBootstrap.name);

  constructor(
    private readonly databaseRepository: DatabaseRepository,
    private readonly doseScheduleService: DoseScheduleService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const ids = await this.databaseRepository.getAllActiveUserMedicationIds();

    for (const id of ids) {
      await this.doseScheduleService.scheduleNewUserMedication(id);
    }

    this.logger.log(
      `Reconciled dose notifications for ${ids.length} medications`,
    );
  }
}
