import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DateTime } from 'luxon';

import { DRIZZLE } from '../database.constants';
import * as schema from '../schema';

type Database = NodePgDatabase<typeof schema>;

const MAX_DOSE_SNOOZES = 2;

// How far back GET /escalation/export looks for dose_log history. Adjustable.
const RECENT_DOSE_LOG_WINDOW_DAYS = 14;

@Injectable()
export class DoseLogRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: Database,
  ) {}

  private async getUserIdByFirebaseUid(
    firebaseUid: string,
  ): Promise<number | undefined> {
    const [currentUser] = await this.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.firebaseUid, firebaseUid))
      .limit(1);

    return currentUser?.id;
  }

  async getTodayMedications(firebaseUid: string) {
    const userId = await this.getUserIdByFirebaseUid(firebaseUid);

    if (!userId) {
      return [];
    }

    const today = this.getTodayDateInPalestine();
    const rows = await this.db
      .select({
        id: schema.userMedication.id,
        frequency: schema.userMedication.frequency,
        dosageAmount: schema.userMedication.dosageAmount,
        dosageUnit: schema.userMedication.dosageUnit,
        dosageForm: schema.userMedication.dosageForm,
        instructions: schema.userMedication.instructions,
        brandName: schema.medication.brandName,
        genericName: schema.medication.genericName,
        scheduleTimeId: schema.scheduleTime.id,
        time: schema.scheduleTime.time,
        doseLogStatus: schema.doseLog.status,
        snoozeCount: schema.doseLog.snoozeCount,
      })

      .from(schema.userMedication)
      .innerJoin(
        schema.medication,
        eq(schema.userMedication.medicationId, schema.medication.id),
      )
      .innerJoin(
        schema.scheduleTime,
        eq(schema.scheduleTime.userMedicationId, schema.userMedication.id),
      )
      .leftJoin(
        schema.doseLog,
        and(
          eq(schema.doseLog.scheduleTimeId, schema.scheduleTime.id),
          eq(schema.doseLog.date, today),
        ),
      )
      .where(
        and(
          eq(schema.userMedication.userId, userId),
          eq(schema.userMedication.status, 'active'),
          lte(schema.userMedication.startDate, today),
          or(
            isNull(schema.userMedication.endDate),
            gte(schema.userMedication.endDate, today),
          ),
        ),
      );

    type TodayDoseStatus = 'upcoming' | 'missed' | 'taken' | 'skipped';
    type TodayMedicationEntry = {
      id: (typeof rows)[number]['id'];
      brandName: (typeof rows)[number]['brandName'];
      genericName: (typeof rows)[number]['genericName'];
      dosageAmount: (typeof rows)[number]['dosageAmount'];
      dosageUnit: (typeof rows)[number]['dosageUnit'];
      dosageForm: (typeof rows)[number]['dosageForm'];
      frequency: (typeof rows)[number]['frequency'];
      instructions: (typeof rows)[number]['instructions'];
      todaySchedule: {
        scheduleTimeId: (typeof rows)[number]['scheduleTimeId'];
        time: (typeof rows)[number]['time'];
        status: TodayDoseStatus;
        snoozeCount: number;
      }[];
      summary: Record<TodayDoseStatus, number>;
    };

    const grouped = new Map<number, TodayMedicationEntry>();

    for (const row of rows) {
      if (!grouped.has(row.id)) {
        grouped.set(row.id, {
          id: row.id,
          brandName: row.brandName,
          genericName: row.genericName,
          dosageAmount: row.dosageAmount,
          dosageUnit: row.dosageUnit,
          dosageForm: row.dosageForm,
          frequency: row.frequency,
          instructions: row.instructions,
          todaySchedule: [],
          summary: { taken: 0, upcoming: 0, missed: 0, skipped: 0 },
        });
      }

      const status: TodayDoseStatus =
        row.doseLogStatus === 'pending' ||
        row.doseLogStatus === 'snoozed' ||
        row.doseLogStatus === null
          ? 'upcoming'
          : row.doseLogStatus;

      const entry = grouped.get(row.id);

      if (!entry) {
        continue;
      }

      entry.todaySchedule.push({
        scheduleTimeId: row.scheduleTimeId,
        time: row.time,
        status,
        snoozeCount: row.snoozeCount ?? 0,
      });
      entry.summary[status]++;
    }

    return Array.from(grouped.values());
  }

  async getAdherenceSummary(firebaseUid: string) {
    const today = this.getTodayDateInPalestine();
    const currentTime = this.getCurrentTimeInPalestine();

    const shiftDate = (date: string, days: number): string => {
      const [year, month, day] = date.split('-').map(Number);

      const value = new Date(Date.UTC(year, month - 1, day));

      value.setUTCDate(value.getUTCDate() + days);

      return value.toISOString().slice(0, 10);
    };

    const startDate = shiftDate(today, -6);

    const userId = await this.getUserIdByFirebaseUid(firebaseUid);

    if (!userId) {
      return {
        startDate,
        endDate: today,
        taken: 0,
        scheduled: 0,
        percentage: 0,
        streak: 0,
      };
    }

    const scheduleRows = await this.db
      .select({
        scheduleTimeId: schema.scheduleTime.id,
        time: schema.scheduleTime.time,
        medicationStartDate: schema.userMedication.startDate,
        medicationEndDate: schema.userMedication.endDate,
      })
      .from(schema.scheduleTime)
      .innerJoin(
        schema.userMedication,
        eq(schema.scheduleTime.userMedicationId, schema.userMedication.id),
      )
      .where(
        and(
          eq(schema.userMedication.userId, userId),
          lte(schema.userMedication.startDate, today),
          or(
            isNull(schema.userMedication.endDate),
            gte(schema.userMedication.endDate, startDate),
          ),
        ),
      );

    const doseLogs = await this.db
      .select({
        scheduleTimeId: schema.doseLog.scheduleTimeId,
        date: schema.doseLog.date,
        status: schema.doseLog.status,
      })
      .from(schema.doseLog)
      .innerJoin(
        schema.scheduleTime,
        eq(schema.doseLog.scheduleTimeId, schema.scheduleTime.id),
      )
      .innerJoin(
        schema.userMedication,
        eq(schema.scheduleTime.userMedicationId, schema.userMedication.id),
      )
      .where(
        and(
          eq(schema.userMedication.userId, userId),
          gte(schema.doseLog.date, startDate),
          lte(schema.doseLog.date, today),
        ),
      );

    const doseLogMap = new Map<string, (typeof doseLogs)[number]['status']>();

    for (const log of doseLogs) {
      doseLogMap.set(`${log.scheduleTimeId}-${log.date}`, log.status);
    }

    let scheduled = 0;
    let taken = 0;

    const dailySummary: {
      date: string;
      scheduled: number;
      taken: number;
    }[] = [];

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const date = shiftDate(startDate, dayOffset);

      let dailyScheduled = 0;
      let dailyTaken = 0;

      for (const schedule of scheduleRows) {
        const medicationActive =
          schedule.medicationStartDate <= date &&
          (schedule.medicationEndDate === null ||
            schedule.medicationEndDate >= date);

        if (!medicationActive) {
          continue;
        }

        if (date === today && schedule.time > currentTime) {
          continue;
        }

        dailyScheduled++;
        scheduled++;

        const status = doseLogMap.get(`${schedule.scheduleTimeId}-${date}`);

        if (status === 'taken') {
          dailyTaken++;
          taken++;
        }
      }

      dailySummary.push({
        date,
        scheduled: dailyScheduled,
        taken: dailyTaken,
      });
    }

    const percentage =
      scheduled === 0 ? 0 : Math.round((taken / scheduled) * 100);

    let streak = 0;

    for (let index = dailySummary.length - 2; index >= 0; index--) {
      const day = dailySummary[index];

      if (day.scheduled === 0) {
        break;
      }

      if (day.taken !== day.scheduled) {
        break;
      }

      streak++;
    }

    return {
      startDate,
      endDate: today,
      taken,
      scheduled,
      percentage,
      streak,
    };
  }

  async getWeeklyDoses(firebaseUid: string) {
    const today = this.getTodayDateInPalestine();
    const currentTime = this.getCurrentTimeInPalestine();

    const shiftDate = (date: string, days: number): string => {
      const [year, month, day] = date.split('-').map(Number);
      const value = new Date(Date.UTC(year, month - 1, day));
      value.setUTCDate(value.getUTCDate() + days);

      return value.toISOString().slice(0, 10);
    };

    const startDate = shiftDate(today, -6);
    const userId = await this.getUserIdByFirebaseUid(firebaseUid);

    if (!userId) {
      return {
        startDate,
        endDate: today,
        days: Array.from({ length: 7 }, (_, index) => ({
          date: shiftDate(startDate, index),
          scheduled: 0,
          taken: 0,
          missed: 0,
          skipped: 0,
        })),
      };
    }

    const scheduleRows = await this.db
      .select({
        scheduleTimeId: schema.scheduleTime.id,
        time: schema.scheduleTime.time,
        medicationStartDate: schema.userMedication.startDate,
        medicationEndDate: schema.userMedication.endDate,
      })
      .from(schema.scheduleTime)
      .innerJoin(
        schema.userMedication,
        eq(schema.scheduleTime.userMedicationId, schema.userMedication.id),
      )
      .where(
        and(
          eq(schema.userMedication.userId, userId),
          lte(schema.userMedication.startDate, today),
          or(
            isNull(schema.userMedication.endDate),
            gte(schema.userMedication.endDate, startDate),
          ),
        ),
      );

    const doseLogs = await this.db
      .select({
        scheduleTimeId: schema.doseLog.scheduleTimeId,
        date: schema.doseLog.date,
        status: schema.doseLog.status,
      })
      .from(schema.doseLog)
      .innerJoin(
        schema.scheduleTime,
        eq(schema.doseLog.scheduleTimeId, schema.scheduleTime.id),
      )
      .innerJoin(
        schema.userMedication,
        eq(schema.scheduleTime.userMedicationId, schema.userMedication.id),
      )
      .where(
        and(
          eq(schema.userMedication.userId, userId),
          gte(schema.doseLog.date, startDate),
          lte(schema.doseLog.date, today),
        ),
      );

    const doseLogMap = new Map<string, (typeof doseLogs)[number]['status']>();

    for (const log of doseLogs) {
      doseLogMap.set(`${log.scheduleTimeId}-${log.date}`, log.status);
    }

    const days: {
      date: string;
      scheduled: number;
      taken: number;
      missed: number;
      skipped: number;
    }[] = [];

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const date = shiftDate(startDate, dayOffset);
      let scheduled = 0;
      let taken = 0;
      let missed = 0;
      let skipped = 0;

      for (const schedule of scheduleRows) {
        const medicationActive =
          schedule.medicationStartDate <= date &&
          (schedule.medicationEndDate === null ||
            schedule.medicationEndDate >= date);

        if (!medicationActive) {
          continue;
        }

        if (date === today && schedule.time > currentTime) {
          continue;
        }

        scheduled++;
        const status = doseLogMap.get(`${schedule.scheduleTimeId}-${date}`);

        if (status === 'taken') {
          taken++;
        } else if (status === 'skipped') {
          skipped++;
        } else {
          missed++;
        }
      }

      days.push({ date, scheduled, taken, missed, skipped });
    }

    return { startDate, endDate: today, days };
  }

  private getTodayDateInPalestine(): string {
    return new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Jerusalem',
    });
  }

  private getCurrentTimeInPalestine(): string {
    return new Date().toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Jerusalem',
      hour12: false,
    });
  }

  private shiftDate(date: string, days: number): string {
    const [year, month, day] = date.split('-').map(Number);
    const value = new Date(Date.UTC(year, month - 1, day));
    value.setUTCDate(value.getUTCDate() + days);

    return value.toISOString().slice(0, 10);
  }

  /**
   * Recent individual dose_log rows for a user, newest first, over the last
   * RECENT_DOSE_LOG_WINDOW_DAYS days up to and including today. Joined to
   * medication for display names. Used by GET /escalation/export — a read-only
   * snapshot of *history*, so pre-generated future doses are excluded.
   */
  async getRecentDoseLogsByUserId(userId: number) {
    const today = this.getTodayDateInPalestine();
    const startDate = this.shiftDate(today, -(RECENT_DOSE_LOG_WINDOW_DAYS - 1));

    return this.db
      .select({
        userMedicationId: schema.doseLog.userMedicationId,
        brandName: schema.medication.brandName,
        genericName: schema.medication.genericName,
        date: schema.doseLog.date,
        scheduledFor: schema.doseLog.scheduledFor,
        status: schema.doseLog.status,
        markedAt: schema.doseLog.markedAt,
      })
      .from(schema.doseLog)
      .innerJoin(
        schema.userMedication,
        eq(schema.doseLog.userMedicationId, schema.userMedication.id),
      )
      .innerJoin(
        schema.medication,
        eq(schema.userMedication.medicationId, schema.medication.id),
      )
      .where(
        and(
          eq(schema.userMedication.userId, userId),
          gte(schema.doseLog.date, startDate),
          lte(schema.doseLog.date, today),
        ),
      )
      .orderBy(desc(schema.doseLog.date), desc(schema.doseLog.scheduledFor));
  }
  async insertDoseLogsForWindow(
    entries: {
      userMedicationId: number;
      scheduleTimeId: number;
      date: string;
      scheduledFor: Date;
    }[],
  ) {
    if (!entries.length) {
      return [];
    }

    return this.db
      .insert(schema.doseLog)
      .values(
        entries.map((entry) => ({ ...entry, status: 'pending' as const })),
      )
      .onConflictDoNothing({
        target: [schema.doseLog.scheduleTimeId, schema.doseLog.date],
      })
      .returning({
        id: schema.doseLog.id,
        scheduleTimeId: schema.doseLog.scheduleTimeId,
        date: schema.doseLog.date,
        scheduledFor: schema.doseLog.scheduledFor,
      });
  }

  async getPendingDoseLogsForWindow(
    userMedicationId: number,
    startDate: string,
    endDate: string,
  ) {
    return this.db
      .select({
        id: schema.doseLog.id,
        scheduleTimeId: schema.doseLog.scheduleTimeId,
        date: schema.doseLog.date,
        scheduledFor: schema.doseLog.scheduledFor,
      })
      .from(schema.doseLog)
      .where(
        and(
          eq(schema.doseLog.userMedicationId, userMedicationId),
          eq(schema.doseLog.status, 'pending'),
          gte(schema.doseLog.date, startDate),
          lte(schema.doseLog.date, endDate),
        ),
      );
  }

  async getDoseLogStatus(doseLogId: number) {
    const [row] = await this.db
      .select({ status: schema.doseLog.status })
      .from(schema.doseLog)
      .where(eq(schema.doseLog.id, doseLogId))
      .limit(1);

    return row?.status ?? null;
  }

  async getDoseLogUserMedicationId(doseLogId: number): Promise<number | null> {
    const [row] = await this.db
      .select({ userMedicationId: schema.doseLog.userMedicationId })
      .from(schema.doseLog)
      .where(eq(schema.doseLog.id, doseLogId))
      .limit(1);

    return row?.userMedicationId ?? null;
  }

  async getDoseNotifiedAt(doseLogId: number): Promise<Date | null> {
    const [row] = await this.db
      .select({ notifiedAt: schema.doseLog.notifiedAt })
      .from(schema.doseLog)
      .where(eq(schema.doseLog.id, doseLogId))
      .limit(1);

    return row?.notifiedAt ?? null;
  }

  async setDoseNotifiedAt(doseLogId: number): Promise<void> {
    await this.db
      .update(schema.doseLog)
      .set({ notifiedAt: new Date() })
      .where(
        and(
          eq(schema.doseLog.id, doseLogId),
          eq(schema.doseLog.status, 'pending'),
        ),
      );
  }

  async markDoseMissedIfPending(doseLogId: number): Promise<number | null> {
    const [updatedDose] = await this.db
      .update(schema.doseLog)
      .set({ status: 'missed', markedAt: new Date() })
      .where(
        and(
          eq(schema.doseLog.id, doseLogId),
          eq(schema.doseLog.status, 'pending'),
        ),
      )
      .returning({
        userMedicationId: schema.doseLog.userMedicationId,
      });

    return updatedDose?.userMedicationId ?? null;
  }

  async getMedicationDisplayInfo(userMedicationId: number): Promise<{
    brandName: string | null;
    genericName: string | null;
    dosageAmount: string;
    dosageUnit: string;
  } | null> {
    const [row] = await this.db
      .select({
        brandName: schema.medication.brandName,
        genericName: schema.medication.genericName,
        dosageAmount: schema.userMedication.dosageAmount,
        dosageUnit: schema.userMedication.dosageUnit,
      })
      .from(schema.userMedication)
      .innerJoin(
        schema.medication,
        eq(schema.userMedication.medicationId, schema.medication.id),
      )
      .where(eq(schema.userMedication.id, userMedicationId))
      .limit(1);

    return row ?? null;
  }

  async findMissedDoseGuidanceSubject(doseLogId: number): Promise<{
    subjectMedicationId: number;
    patientId: number;
    scheduleTimeId: number | null;
  } | null> {
    const [row] = await this.db
      .select({
        subjectMedicationId: schema.userMedication.id,
        patientId: schema.userMedication.userId,
        scheduleTimeId: schema.doseLog.scheduleTimeId,
      })
      .from(schema.doseLog)
      .innerJoin(
        schema.userMedication,
        eq(schema.doseLog.userMedicationId, schema.userMedication.id),
      )
      .where(
        and(
          eq(schema.doseLog.id, doseLogId),
          eq(schema.userMedication.status, 'active'),
          eq(schema.userMedication.completion, 'ongoing'),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async getPendingDoseLogIds(userMedicationId: number): Promise<number[]> {
    const rows = await this.db
      .select({ id: schema.doseLog.id })
      .from(schema.doseLog)
      .where(
        and(
          eq(schema.doseLog.userMedicationId, userMedicationId),
          eq(schema.doseLog.status, 'pending'),
        ),
      );

    return rows.map((row) => row.id);
  }

  async deletePendingDoseLogs(userMedicationId: number): Promise<void> {
    await this.db
      .delete(schema.doseLog)
      .where(
        and(
          eq(schema.doseLog.userMedicationId, userMedicationId),
          eq(schema.doseLog.status, 'pending'),
        ),
      );
  }

  async markDoseStatus(
    scheduleTimeId: number,
    status: 'taken' | 'skipped',
    firebaseUid: string,
  ) {
    const today = this.getTodayDateInPalestine();

    const userId = await this.getUserIdByFirebaseUid(firebaseUid);

    const [scheduleTimeRow] = userId
      ? await this.db
          .select({
            id: schema.scheduleTime.id,
            time: schema.scheduleTime.time,
            userMedicationId: schema.scheduleTime.userMedicationId,
          })
          .from(schema.scheduleTime)
          .innerJoin(
            schema.userMedication,
            eq(schema.scheduleTime.userMedicationId, schema.userMedication.id),
          )
          .where(
            and(
              eq(schema.scheduleTime.id, scheduleTimeId),
              eq(schema.userMedication.userId, userId),
            ),
          )
          .limit(1)
      : [];

    if (!scheduleTimeRow) {
      throw new NotFoundException(
        `schedule time ${scheduleTimeId} was not found`,
      );
    }

    const [existing] = await this.db
      .select()
      .from(schema.doseLog)
      .where(
        and(
          eq(schema.doseLog.scheduleTimeId, scheduleTimeId),
          eq(schema.doseLog.date, today),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(schema.doseLog)
        .set({ status, markedAt: new Date() })
        .where(eq(schema.doseLog.id, existing.id))
        .returning();

      return updated;
    }

    const [inserted] = await this.db
      .insert(schema.doseLog)
      .values({
        scheduleTimeId,
        userMedicationId: scheduleTimeRow.userMedicationId,
        date: today,
        scheduledFor: DateTime.fromISO(`${today}T${scheduleTimeRow.time}`, {
          zone: 'Asia/Jerusalem',
        }).toJSDate(),
        status,
      })
      .returning();

    return inserted;
  }

  private async resolveTodayPendingDoseLog(
    scheduleTimeId: number,
    firebaseUid: string,
  ): Promise<{
    doseLogId: number;
    userMedicationId: number;
    scheduleTimeId: number;
    userId: number;
    date: string;
    snoozeCount: number;
    notifiedAt: Date | null;
  }> {
    const userId = await this.getUserIdByFirebaseUid(firebaseUid);

    if (!userId) {
      throw new NotFoundException(
        `schedule time ${scheduleTimeId} was not found`,
      );
    }

    const [scheduleTimeRow] = await this.db
      .select({ userMedicationId: schema.scheduleTime.userMedicationId })
      .from(schema.scheduleTime)
      .innerJoin(
        schema.userMedication,
        eq(schema.scheduleTime.userMedicationId, schema.userMedication.id),
      )
      .where(
        and(
          eq(schema.scheduleTime.id, scheduleTimeId),
          eq(schema.userMedication.userId, userId),
        ),
      )
      .limit(1);

    if (!scheduleTimeRow) {
      throw new NotFoundException(
        `schedule time ${scheduleTimeId} was not found`,
      );
    }

    const today = this.getTodayDateInPalestine();
    const [doseLogRow] = await this.db
      .select({
        id: schema.doseLog.id,
        status: schema.doseLog.status,
        snoozeCount: schema.doseLog.snoozeCount,
        date: schema.doseLog.date,
        notifiedAt: schema.doseLog.notifiedAt,
      })
      .from(schema.doseLog)
      .where(
        and(
          eq(schema.doseLog.scheduleTimeId, scheduleTimeId),
          eq(schema.doseLog.date, today),
        ),
      )
      .limit(1);

    if (!doseLogRow || doseLogRow.status !== 'pending') {
      throw new ConflictException(
        `dose for schedule time ${scheduleTimeId} is not pending`,
      );
    }

    return {
      doseLogId: doseLogRow.id,
      userMedicationId: scheduleTimeRow.userMedicationId,
      scheduleTimeId,
      userId,
      date: doseLogRow.date,
      snoozeCount: doseLogRow.snoozeCount,
      notifiedAt: doseLogRow.notifiedAt,
    };
  }

  resolveDismissibleDoseLog(scheduleTimeId: number, firebaseUid: string) {
    return this.resolveTodayPendingDoseLog(scheduleTimeId, firebaseUid);
  }

  async snoozeDose(scheduleTimeId: number, firebaseUid: string) {
    const resolved = await this.resolveTodayPendingDoseLog(
      scheduleTimeId,
      firebaseUid,
    );

    if (!resolved.notifiedAt) {
      throw new ConflictException(
        `reminder for schedule time ${scheduleTimeId} has not been sent yet`,
      );
    }

    if (resolved.snoozeCount >= MAX_DOSE_SNOOZES) {
      throw new ConflictException(
        `dose for schedule time ${scheduleTimeId} has already been snoozed the maximum number of times`,
      );
    }

    const [updated] = await this.db
      .update(schema.doseLog)
      .set({ snoozeCount: resolved.snoozeCount + 1 })
      .where(
        and(
          eq(schema.doseLog.id, resolved.doseLogId),
          eq(schema.doseLog.status, 'pending'),
          eq(schema.doseLog.snoozeCount, resolved.snoozeCount),
        ),
      )
      .returning();

    if (!updated) {
      throw new ConflictException(
        `dose for schedule time ${scheduleTimeId} has already been snoozed the maximum number of times`,
      );
    }

    return { ...resolved, snoozeCount: updated.snoozeCount };
  }
}
