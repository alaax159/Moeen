import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import {
  CHECK_DOSE_MISSED_JOB,
  CheckDoseMissedJobData,
  DOSE_NOTIFICATIONS_QUEUE,
  DOSE_REMINDER_CATEGORY,
  REFILL_DOSE_WINDOW_JOB,
  RefillDoseWindowJobData,
  SEND_DOSE_NOTIFICATION_JOB,
  SEND_FOLLOW_UP_NOTIFICATION_JOB,
  SendDoseNotificationJobData,
  SendFollowUpNotificationJobData,
} from './dose-notification-queue.constants';
import { DoseScheduleService } from './dose-schedule.service';
import { PUSH_SENDER_PORT, PushSenderPort } from '../adapters/push-sender-adapter/push-sender-adapter.port';

@Processor(DOSE_NOTIFICATIONS_QUEUE)
export class DoseNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(DoseNotificationProcessor.name);

  constructor(
    private readonly doseScheduleService: DoseScheduleService,
    @Inject(PUSH_SENDER_PORT) private readonly pushSender: PushSenderPort,
  ) {
    super();
  }

  async process(
    job: Job<
      | SendDoseNotificationJobData
      | SendFollowUpNotificationJobData
      | RefillDoseWindowJobData
      | CheckDoseMissedJobData
    >,
  ): Promise<void> {
    switch (job.name) {
      case SEND_DOSE_NOTIFICATION_JOB:
        return this.handleSendDose(job.data as SendDoseNotificationJobData);

      case SEND_FOLLOW_UP_NOTIFICATION_JOB:
        return this.handleFollowUp(
          job.data as SendFollowUpNotificationJobData,
        );

      case REFILL_DOSE_WINDOW_JOB:
        return this.handleRefill(job.data as RefillDoseWindowJobData);

      case CHECK_DOSE_MISSED_JOB:
        return this.handleCheckDoseMissed(
          job.data as CheckDoseMissedJobData,
        );

      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleSendDose(
    data: SendDoseNotificationJobData,
  ): Promise<void> {
    const status = await this.doseScheduleService.getDoseStatus(data.doseLogId);

    // Already taken/skipped/snoozed/missed by the time this job became due
    // (or the dose_log row is gone) � nothing to notify about.
    if (status !== 'pending') {
      return;
    }

    const alreadyNotified = (await this.doseScheduleService.getDoseNotifiedAt(data.doseLogId)) !== null;

    if (alreadyNotified && !data.isSnoozeReschedule) {
      // notifiedAt is set and this is NOT a snooze re-fire: a prior attempt
      // already sent the push, then something after it (scheduleFollowUp) threw
      // and BullMQ retried the job. status alone can't tell us this —
      // recordNotified only touches notifiedAt, never status. Don't resend; just
      // retry what actually failed. (A snooze re-fire carries isSnoozeReschedule
      // and is a deliberate "remind me again", so it skips this and sends below.)
      await this.doseScheduleService.scheduleFollowUp({
        doseLogId: data.doseLogId,
        userId: data.userId,
        date: data.date,
      });
      this.logger.log(
        `retry: follow-up scheduled without resending push for doseLogId=${data.doseLogId}`,
      );
      return;
    }

    const medication = await this.doseScheduleService.getMedicationDisplayInfo(
      data.userMedicationId,
    );

    if (!medication) {
      this.logger.warn(
        `No medication info found for userMedicationId=${data.userMedicationId} — sending generic push.`,
      );
    }

    const medicationLabel = medication?.brandName ?? medication?.genericName ?? 'your medication';
    const body = medication
      ? `Time to take ${medicationLabel} — ${medication.dosageAmount} ${medication.dosageUnit}`
      : `Time to take ${medicationLabel}`;

    const outcome = await this.resolveAndSend({
      userId: data.userId,
      title: 'Medication reminder',
      body,
      data: {
        scheduleTimeId: data.scheduleTimeId,
        userMedicationId: data.userMedicationId,
      },
    });

    if (outcome === 'no-devices') {
      // Normal case (no device registered, or all disabled) — not an error.
      this.logger.log(
        `no active devices for userId=${data.userId} — skipping send for doseLogId=${data.doseLogId}`,
      );
      return;
    }

    if (outcome === 'all-failed') {
      this.logger.warn(
        `all push sends failed for doseLogId=${data.doseLogId} userId=${data.userId}`,
      );
      return;
    }

    await this.doseScheduleService.recordNotified(data.doseLogId);

    this.logger.log(
      `send-dose delivered for doseLogId=${data.doseLogId} userId=${data.userId} date=${data.date}`,
    );

    await this.doseScheduleService.scheduleFollowUp({
      doseLogId: data.doseLogId,
      userId: data.userId,
      date: data.date,
    });
  }

  private async handleFollowUp(
    data: SendFollowUpNotificationJobData,
  ): Promise<void> {
    const status = await this.doseScheduleService.getDoseStatus(data.doseLogId);

    if (status !== 'pending') {
      return;
    }

    // Follow-up job data has no userMedicationId (unlike
    // SendDoseNotificationJobData) — resolve it from the dose_log row, the
    // same way retryMissedDoseSafetyCheck does.
    const userMedicationId =
      await this.doseScheduleService.getDoseLogUserMedicationId(data.doseLogId);

    const medication =
      userMedicationId === null
        ? null
        : await this.doseScheduleService.getMedicationDisplayInfo(
            userMedicationId,
          );

    if (!medication) {
      this.logger.warn(
        `No medication info for follow-up doseLogId=${data.doseLogId} — sending generic push.`,
      );
    }

    const medicationLabel = medication?.brandName ?? medication?.genericName ?? 'your medication';
    const body = medication
      ? `You haven't logged ${medicationLabel} yet — tap to confirm or skip.`
      : `You haven't logged your medication yet — tap to confirm or skip.`;

    const outcome = await this.resolveAndSend({
      userId: data.userId,
      title: 'Did you take your medication?',
      body,
      data: { doseLogId: data.doseLogId },
    });

    if (outcome === 'no-devices') {
      this.logger.log(
        `no active devices for userId=${data.userId} — skipping follow-up for doseLogId=${data.doseLogId}`,
      );
      return;
    }

    if (outcome === 'all-failed') {
      this.logger.warn(
        `all follow-up push sends failed for doseLogId=${data.doseLogId} userId=${data.userId}`,
      );
      return;
    }

    this.logger.log(
      `send-follow-up delivered for doseLogId=${data.doseLogId} userId=${data.userId} date=${data.date}`,
    );
  }

  /**
   * Shared send core for the dose reminder and its follow-up: resolve the
   * user's active device tokens, push, prune any tokens Expo reports as
   * unregistered, and report whether anything landed. Deliberately owns no
   * medication lookup, wording, payload shape, or dose_log state — each
   * caller keeps that inline.
   */
  private async resolveAndSend(params: {
    userId: number;
    title: string;
    body: string;
    data: Record<string, unknown>;
  }): Promise<'sent' | 'no-devices' | 'all-failed'> {
    const devices = await this.doseScheduleService.getActiveDeviceTokens(
      params.userId,
    );

    if (devices.length === 0) {
      return 'no-devices';
    }

    const results = await this.pushSender.send({
      tokens: devices.map((device) => device.expoPushToken),
      title: params.title,
      body: params.body,
      categoryId: DOSE_REMINDER_CATEGORY,
      data: params.data,
    });

    for (const result of results) {
      if (result.status === 'error' && result.errorCode === 'DeviceNotRegistered') {
        try {
          await this.doseScheduleService.deactivateDeviceToken(result.token);
          this.logger.log(
            `push token no longer registered for userId=${params.userId} — deactivated`,
          );
        } catch (error) {
          // A failed cleanup must never fail the job: BullMQ would retry and
          // re-send the push (the same duplicate-send risk guarded elsewhere).
          this.logger.warn(
            `failed to deactivate stale push token for userId=${params.userId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    return results.some((result) => result.status === 'ok')
      ? 'sent'
      : 'all-failed';
  }

  private async handleRefill(data: RefillDoseWindowJobData): Promise<void> {
    await this.doseScheduleService.runRefill(data.userMedicationId);
  }

  private async handleCheckDoseMissed(
    data: CheckDoseMissedJobData,
  ): Promise<void> {
    const status = await this.doseScheduleService.getDoseStatus(data.doseLogId);

    if (status === 'pending') {
      await this.doseScheduleService.recordMissedIfStillPending(data.doseLogId);
      return;
    }

    if (status === 'missed') {
      await this.doseScheduleService.retryMissedDoseSafetyCheck(data.doseLogId);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error): void {
    this.logger.error(
      `Job ${job.id} (${job.name}) failed: ${error.message}`,
      error.stack,
    );
  }
}
