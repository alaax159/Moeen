import { Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseRepository } from '../../database/repository/database.repository';

type MedicationInfoRow = Awaited<
  ReturnType<DatabaseRepository['getMedicationById']>
>[number];
type UserMedicationRow = NonNullable<MedicationInfoRow['userMedication']>;
type ScheduleTimeRow = NonNullable<MedicationInfoRow['scheduleTime']>;
type UserMedicationInfo = UserMedicationRow & {
  scheduleTimes: ScheduleTimeRow[];
};

@Injectable()
export class GetMedicationInfoService {
  constructor(private readonly medicationRepository: DatabaseRepository) {}

  async getMedicationInfo(id: number, firebaseUid: string) {
    const rows = await this.medicationRepository.getMedicationById(
      id,
      firebaseUid,
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Medication ${id} was not found`);
    }

    const userMedicationsById = new Map<number, UserMedicationInfo>();

    for (const row of rows) {
      if (!row.userMedication) {
        continue;
      }

      let userMedication = userMedicationsById.get(row.userMedication.id);
      if (!userMedication) {
        userMedication = { ...row.userMedication, scheduleTimes: [] };
        userMedicationsById.set(row.userMedication.id, userMedication);
      }

      if (row.scheduleTime) {
        userMedication.scheduleTimes.push(row.scheduleTime);
      }
    }

    return {
      medication: rows[0].medication,
      userMedications: Array.from(userMedicationsById.values()),
    };
  }
}
