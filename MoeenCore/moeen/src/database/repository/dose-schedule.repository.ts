import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../database.constants';
import * as schema from '../schema';

type Database = NodePgDatabase<typeof schema>;

@Injectable()
export class DoseScheduleRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: Database,
  ) {}

  async getScheduleTimesForUserMedication(userMedicationId: number) {
    const [userMedication] = await this.db
      .select({
        id: schema.userMedication.id,
        userId: schema.userMedication.userId,
        status: schema.userMedication.status,
        startDate: schema.userMedication.startDate,
        endDate: schema.userMedication.endDate,
      })
      .from(schema.userMedication)
      .where(eq(schema.userMedication.id, userMedicationId))
      .limit(1);

    if (!userMedication) {
      return null;
    }

    const scheduleTimes = await this.db
      .select({
        scheduleTimeId: schema.scheduleTime.id,
        time: schema.scheduleTime.time,
      })
      .from(schema.scheduleTime)
      .where(eq(schema.scheduleTime.userMedicationId, userMedicationId));

    return { userMedication, scheduleTimes };
  }

  async getAllActiveUserMedicationIds(): Promise<number[]> {
    const rows = await this.db
      .select({ id: schema.userMedication.id })
      .from(schema.userMedication)
      .where(eq(schema.userMedication.status, 'active'));

    return rows.map((row) => row.id);
  }
}
