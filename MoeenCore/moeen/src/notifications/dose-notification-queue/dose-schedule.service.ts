import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DateTime } from 'luxon';

import { DatabaseRepository } from '../../database/repository/database.repository';
import { MissedDoseGuidanceTrigger } from '../../guidance/doses/missed-dose-guidance-trigger.service';
import { MedicationSafetyEventsService } from '../../medication-safety/medication-safety-events.service';
import { MedicationSafetyTriggerType } from '../../medication-safety/medication-safety.events';
import type { PersistedMedicationSafetyResult } from '../../medication-safety/medication-safety.contracts';
import {
  CHECK_DOSE_MISSED_JOB,
  CheckDoseMissedJobData,
  DOSE_GENERATION_WINDOW_DAYS,
  DOSE_MISSED_GRACE_MINUTES,
  DOSE_NOTIFICATION_TIMEZONE,
  DOSE_NOTIFICATIONS_QUEUE,
  DOSE_REFILL_LEAD_DAYS,
  REFILL_DOSE_WINDOW_JOB,
  RefillDoseWindowJobData,
  SEND_DOSE_NOTIFICATION_JOB,
  SEND_FOLLOW_UP_NOTIFICATION_JOB,
  SendDoseNotificationJobData,
  SendFollowUpNotificationJobData,
} from './dose-notification-queue.constants';

type QueueJobData =
  | SendDoseNotificationJobData
  | SendFollowUpNotificationJobData
  | RefillDoseWindowJobData
  | CheckDoseMissedJobData;

/**
 * Owns every write to the dose-notifications BullMQ queue. Pure delayed
 * jobs only (no repeatable/cron patterns): a full dose_log window is
 * generated up front, each dose gets its own delayed "send-dose" job plus
 * a "check-dose-missed" follow-up, and a self-chaining "refill-dose-window"
 * job extends the window forward for long-running/ongoing medications
 * without any external scheduler.
 */
@Injectable()
export class DoseScheduleService {
  private readonly logger = new Logger(DoseScheduleService.name);

  constructor(
    @InjectQueue(DOSE_NOTIFICATIONS_QUEUE)
    private readonly queue: Queue<QueueJobData>,
    private readonly databaseRepository: DatabaseRepository,
    private readonly medicationSafetyEventsService: MedicationSafetyEventsService,
    private readonly missedDoseGuidanceTrigger: MissedDoseGuidanceTrigger,
  ) {}

  async scheduleNewUserMedication(userMedicationId: number): Promise<void> {
    await this.safely('scheduleNewUserMedication', userMedicationId, () =>
      this.syncWindow(userMedicationId),
    );
  }

  async rescheduleUserMedication(userMedicationId: number): Promise<void> {
    await this.safely('rescheduleUserMedication', userMedicationId, () =>
      this.cancelQueuedWork(userMedicationId).then(() =>
        this.syncWindow(userMedicationId),
      ),
    );
  }

  async cancelUserMedication(userMedicationId: number): Promise<void> {
    await this.safely('cancelUserMedication', userMedicationId, () =>
      this.cancelQueuedWork(userMedicationId),
    );
  }

  /** Invoked by the worker when a refill-dose-window job runs. */
  async runRefill(userMedicationId: number): Promise<void> {
    await this.syncWindow(userMedicationId);
  }

  /** Invoked by the worker before it acts on a due send-dose job. */
  async getDoseStatus(doseLogId: number) {
    return this.databaseRepository.getDoseLogStatus(doseLogId);
  }

  /** Invoked by the worker once it has (would have) notified the user. */
  async recordNotified(doseLogId: number): Promise<void> {
    await this.databaseRepository.setDoseNotifiedAt(doseLogId);
  }

  async getMedicationDisplayInfo(userMedicationId: number) {
    return this.databaseRepository.getMedicationDisplayInfo(userMedicationId);
  }

  /** Invoked by the worker for a follow-up job, whose data carries no userMedicationId. */
  async getDoseLogUserMedicationId(doseLogId: number): Promise<number | null> {
    return this.databaseRepository.getDoseLogUserMedicationId(doseLogId);
  }

  async getActiveDeviceTokens(userId: number) {
    return this.databaseRepository.getActiveDeviceTokens(userId);
  }

  async getDoseNotifiedAt(doseLogId: number) {
    return this.databaseRepository.getDoseNotifiedAt(doseLogId);
  }

  async deactivateDeviceToken(expoPushToken: string): Promise<void> {
    await this.databaseRepository.deactivateDeviceToken(expoPushToken);
  }

  async scheduleFollowUp(data: SendFollowUpNotificationJobData): Promise<void> {
    const preferences = await this.databaseRepository.getFollowUpPreferences(
      data.userId,
    );

    if (
      !preferences?.followUpEnabled ||
      preferences.followUpDelayMin === null ||
      preferences.followUpDelayMin <= 0
    ) {
      return;
    }

    const delay = preferences.followUpDelayMin * 60_000;

    await this.upsertJob(
      SEND_FOLLOW_UP_NOTIFICATION_JOB,
      this.followUpJobId(data.doseLogId),
      data,
      delay,
    );
  }

  /** Invoked by the worker when a pending dose becomes missed. */
  async recordMissedIfStillPending(doseLogId: number): Promise<void> {
    const userMedicationId =
      await this.databaseRepository.markDoseMissedIfPending(doseLogId);

    if (userMedicationId === null) {
      return; // nothing was actually marked missed — already taken, or a race with the
      // patient confirming it right before this ran — nothing to check or explain
    }

    let safetyCheckError: Error | null = null;
    let safetyRunId: string | null = null;
    try {
      const safety = await this.runMissedDoseSafetyCheck(
        userMedicationId,
        doseLogId,
      );
      safetyRunId = safety.runId;
    } catch (error) {
      safetyCheckError = normalizeError(error);
    }

    let guidanceError: Error | null = null;
    try {
      await this.missedDoseGuidanceTrigger.trigger(doseLogId, safetyRunId);
    } catch (error) {
      guidanceError = normalizeError(error);
    }

    if (safetyCheckError) {
      throw safetyCheckError;
    }
    if (guidanceError) {
      throw guidanceError;
    }
  }

  /** Re-runs safety after BullMQ retries a dose already marked missed. */
  async retryMissedDoseSafetyCheck(doseLogId: number): Promise<void> {
    const userMedicationId =
      await this.databaseRepository.getDoseLogUserMedicationId(doseLogId);

    if (userMedicationId === null) {
      return;
    }

    const safety = await this.runMissedDoseSafetyCheck(
      userMedicationId,
      doseLogId,
    );
    await this.missedDoseGuidanceTrigger.trigger(doseLogId, safety.runId);
  }

  private async runMissedDoseSafetyCheck(
    userMedicationId: number,
    doseLogId: number,
  ): Promise<PersistedMedicationSafetyResult> {
    const result = await this.medicationSafetyEventsService.emitTriggerAndWait({
      userMedicationId,
      trigger: MedicationSafetyTriggerType.MISSED,
      idempotencyKey: `dose-missed:${doseLogId}`,
    });

    if (!result || result.runId === undefined) {
      throw new Error(
        'Medication safety trigger completed without a persisted run',
      );
    }

    return result;
  }

  /**
   * Re-delays a dose's existing send-dose job (snooze). Reuses the same job
   * type/id as the original schedule so the processor's pending-status guard
   * still applies when it re-fires, and stamps isSnoozeReschedule so
   * handleSendDose sends the push again instead of treating the re-fire as a
   * crash-retry. Callers must not change the dose's status away from 'pending'
   * when snoozing.
   */
  async requeueSendDose(
    data: SendDoseNotificationJobData,
    delayMs: number,
  ): Promise<void> {
    await this.upsertJob(
      SEND_DOSE_NOTIFICATION_JOB,
      this.sendDoseJobId(data.doseLogId),
      { ...data, isSnoozeReschedule: true },
      delayMs,
    );
  }

  /** Cancels a dose's queued send-dose job (dismiss). */
  async cancelSendDose(doseLogId: number): Promise<void> {
    await this.removeJob(this.sendDoseJobId(doseLogId));
  }

  private async cancelQueuedWork(userMedicationId: number): Promise<void> {
    const doseLogIds =
      await this.databaseRepository.getPendingDoseLogIds(userMedicationId);

    await Promise.all(
      doseLogIds.map((id) =>
        Promise.all([
          this.removeJob(this.sendDoseJobId(id)),
          this.removeJob(this.followUpJobId(id)),
          this.removeJob(this.missedCheckJobId(id)),
        ]),
      ),
    );

    await this.databaseRepository.deletePendingDoseLogs(userMedicationId);
    await this.removeJob(this.refillJobId(userMedicationId));
  }

  private async syncWindow(userMedicationId: number): Promise<void> {
    const current =
      await this.databaseRepository.getScheduleTimesForUserMedication(
        userMedicationId,
      );

    if (
      !current ||
      current.userMedication.status !== 'active' ||
      !current.scheduleTimes.length
    ) {
      return;
    }

    const { userMedication, scheduleTimes } = current;

    const today = DateTime.now()
      .setZone(DOSE_NOTIFICATION_TIMEZONE)
      .startOf('day');
    const medicationStart = DateTime.fromISO(userMedication.startDate, {
      zone: DOSE_NOTIFICATION_TIMEZONE,
    }).startOf('day');
    const medicationEnd = userMedication.endDate
      ? DateTime.fromISO(userMedication.endDate, {
          zone: DOSE_NOTIFICATION_TIMEZONE,
        }).startOf('day')
      : null;

    const windowStart = medicationStart > today ? medicationStart : today;
    const maxWindowEnd = today.plus({
      days: DOSE_GENERATION_WINDOW_DAYS - 1,
    });
    const windowEnd =
      medicationEnd && medicationEnd < maxWindowEnd
        ? medicationEnd
        : maxWindowEnd;

    if (windowEnd < windowStart) {
      await this.removeJob(this.refillJobId(userMedicationId));
      return;
    }

    const entries: {
      userMedicationId: number;
      scheduleTimeId: number;
      date: string;
      scheduledFor: Date;
    }[] = [];

    for (let day = windowStart; day <= windowEnd; day = day.plus({ days: 1 })) {
      const date = day.toISODate()!;
      for (const { scheduleTimeId, time } of scheduleTimes) {
        entries.push({
          userMedicationId,
          scheduleTimeId,
          date,
          scheduledFor: DateTime.fromISO(`${date}T${time}`, {
            zone: DOSE_NOTIFICATION_TIMEZONE,
          }).toJSDate(),
        });
      }
    }

    await this.databaseRepository.insertDoseLogsForWindow(entries);

    const pending = await this.databaseRepository.getPendingDoseLogsForWindow(
      userMedicationId,
      windowStart.toISODate()!,
      windowEnd.toISODate()!,
    );

    await Promise.all(
      pending.map((row) =>
        this.scheduleDoseRow({
          doseLogId: row.id,
          scheduledFor: DateTime.fromJSDate(row.scheduledFor, {
            zone: DOSE_NOTIFICATION_TIMEZONE,
          }),
          date: row.date,
          userMedicationId,
          scheduleTimeId: row.scheduleTimeId,
          userId: userMedication.userId,
        }),
      ),
    );

    const moreDosesRemain = !medicationEnd || medicationEnd > windowEnd;

    if (moreDosesRemain) {
      const refillAt = windowEnd.minus({ days: DOSE_REFILL_LEAD_DAYS });
      const delay = Math.max(refillAt.diff(DateTime.now()).milliseconds, 0);
      await this.upsertJob(
        REFILL_DOSE_WINDOW_JOB,
        this.refillJobId(userMedicationId),
        { userMedicationId },
        delay,
      );
    } else {
      await this.removeJob(this.refillJobId(userMedicationId));
    }
  }

  private async scheduleDoseRow(params: {
    doseLogId: number;
    scheduledFor: DateTime;
    date: string;
    userMedicationId: number;
    scheduleTimeId: number | null;
    userId: number;
  }): Promise<void> {
    const notifyDelay = params.scheduledFor.diff(DateTime.now()).milliseconds;

    // Dose time already passed (e.g. medication added after today's
    // earlier dose time) — keep the pending dose_log row but don't fire a
    // stale notification for it. It still gets a missed-check below.
    if (notifyDelay > 0) {
      const data: SendDoseNotificationJobData = {
        doseLogId: params.doseLogId,
        userMedicationId: params.userMedicationId,
        scheduleTimeId: params.scheduleTimeId,
        userId: params.userId,
        date: params.date,
      };

      await this.queue.add(SEND_DOSE_NOTIFICATION_JOB, data, {
        jobId: this.sendDoseJobId(params.doseLogId),
        delay: notifyDelay,
      });
    }

    await this.scheduleMissedCheck(params.doseLogId, params.scheduledFor);
  }

  private async scheduleMissedCheck(
    doseLogId: number,
    scheduledFor: DateTime,
  ): Promise<void> {
    const missedAt = scheduledFor.plus({
      minutes: DOSE_MISSED_GRACE_MINUTES,
    });
    const delay = missedAt.diff(DateTime.now()).milliseconds;

    const data: CheckDoseMissedJobData = { doseLogId };

    await this.upsertJob(
      CHECK_DOSE_MISSED_JOB,
      this.missedCheckJobId(doseLogId),
      data,
      Math.max(0, delay),
    );
  }

  private async upsertJob(
    name: string,
    jobId: string,
    data: QueueJobData,
    delay: number,
  ): Promise<void> {
    await this.removeJob(jobId);
    await this.queue.add(name, data, { jobId, delay });
  }

  private async removeJob(jobId: string): Promise<void> {
    try {
      await this.queue.remove(jobId);
    } catch (error) {
      this.logger.warn(`Failed to remove job ${jobId}: ${error}`);
    }
  }

  private sendDoseJobId(doseLogId: number): string {
    return `dose-${doseLogId}`;
  }

  private followUpJobId(doseLogId: number): string {
    return `follow-up-${doseLogId}`;
  }
  private missedCheckJobId(doseLogId: number): string {
    return `missed-check-${doseLogId}`;
  }

  private refillJobId(userMedicationId: number): string {
    return `refill-${userMedicationId}`;
  }

  private async safely(
    operation: string,
    contextId: number,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.logger.error(
        `${operation} failed for ${contextId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
