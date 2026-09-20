import { Injectable } from '@nestjs/common';

import { DatabaseRepository } from '../../database/repository/database.repository';
import { DoseScheduleService } from '../../notifications/dose-notification-queue/dose-schedule.service';
import { UserMedicationStatus } from '../dto/add-medication.dto';
import { GuidanceMessageRepository } from './guidance-message.repository';

const SNOOZE_DELAY_MS = 2 * 60_000;

@Injectable()
export class ListMedicationService {
  constructor(
    private readonly databaseRepository: DatabaseRepository,
    private readonly doseScheduleService: DoseScheduleService,
    private readonly guidanceMessageRepository: GuidanceMessageRepository,
  ) {}

  getMedications(firebaseUid: string, status?: UserMedicationStatus) {
    return this.databaseRepository.getUserMedications(firebaseUid, status);
  }
  getTodayMedications(firebaseUid: string) {
    return this.databaseRepository.getTodayMedications(firebaseUid);
  }
  async getTodayDoses(firebaseUid: string) {
  const medications = await this.databaseRepository.getTodayMedications(firebaseUid);
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, matches the schema's date column

  const doses = medications.flatMap((medication) =>
    medication.todaySchedule.map((dose: any) => ({
      scheduleTimeId: dose.scheduleTimeId,
      userMedicationId: medication.id,
      brandName: medication.brandName,
      genericName: medication.genericName,
      dosageAmount: medication.dosageAmount,
      dosageUnit: medication.dosageUnit,
      dosageForm: medication.dosageForm,
      instructions: medication.instructions,
      time: dose.time,
      status: dose.status,
      snoozeCount: dose.snoozeCount,
    })),
  );

  const withGuidance = await Promise.all(
    doses.map(async (dose) => ({
      ...dose,
      guidance: dose.status === 'missed' ? await this.guidanceMessageRepository.findForScheduleTimeToday(dose.scheduleTimeId, today) : null,
    })),
  );

  return withGuidance.sort((a, b) => a.time.localeCompare(b.time));
}
getAdherenceSummary(firebaseUid: string) {
  return this.databaseRepository.getAdherenceSummary(firebaseUid);
}
getWeeklyDoses(firebaseUid: string) {
  return this.databaseRepository.getWeeklyDoses(firebaseUid);
}
  markDoseTaken(scheduleTimeId: number, firebaseUid: string) {
    return this.databaseRepository.markDoseStatus(
      scheduleTimeId,
      'taken',
      firebaseUid,
    );
  }

  markDoseSkipped(scheduleTimeId: number, firebaseUid: string) {
    return this.databaseRepository.markDoseStatus(
      scheduleTimeId,
      'skipped',
      firebaseUid,
    );
  }

  async snoozeDose(scheduleTimeId: number, firebaseUid: string) {
    const dose = await this.databaseRepository.snoozeDose(
      scheduleTimeId,
      firebaseUid,
    );

    await this.doseScheduleService.requeueSendDose(
      {
        doseLogId: dose.doseLogId,
        userMedicationId: dose.userMedicationId,
        scheduleTimeId: dose.scheduleTimeId,
        userId: dose.userId,
        date: dose.date,
      },
      SNOOZE_DELAY_MS,
    );

    return dose;
  }

  async dismissDose(scheduleTimeId: number, firebaseUid: string) {
    const dose = await this.databaseRepository.resolveDismissibleDoseLog(
      scheduleTimeId,
      firebaseUid,
    );

    await this.doseScheduleService.cancelSendDose(dose.doseLogId);

    return dose;
  }
}