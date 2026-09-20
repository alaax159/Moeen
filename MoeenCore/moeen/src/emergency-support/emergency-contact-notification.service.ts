import { Inject, Injectable, Logger } from '@nestjs/common';

import { EmergencyContactRepository } from '../database/repository/emergency-contact.repository';
import { EmergencyNotificationLogRepository } from '../database/repository/emergency-notification-log.repository';
import { HealthProfileRepository } from '../database/repository/health-profile.repository';
import { NotificationPreferencesRepository } from '../database/repository/notification-preferences.repository';
import {
  SMS_SENDER_PORT,
  SmsSendResult,
  SmsSenderPort,
} from '../notifications/adapters/sms-sender-adapter/sms-sender-adapter.port';

/**
 * Events that can notify a patient's emergency contacts. One member for now;
 * the union is the extension point — add an event and a template together.
 */
export type EmergencyNotificationEvent = 'severe_medication_reaction';

/**
 * Fixed, non-generated message copy. `patientName` is the only variable — no
 * clinical detail and no model-generated text in a safety notification, the
 * same invariant the guidance layer enforces for every patient-facing string.
 */
export const EMERGENCY_NOTIFICATION_TEMPLATES: Record<
  EmergencyNotificationEvent,
  (patientName: string) => string
> = {
  severe_medication_reaction: (patientName) =>
    `Moeen safety alert: a serious medication safety issue was flagged for ` +
    `${patientName}. You are listed as their emergency contact — please check ` +
    `on them as soon as possible.`,
};

const UNKNOWN_PATIENT = 'a person you are an emergency contact for';

/**
 * Suppress a repeat emergency-contact notification for the same user within this
 * window — a flapping severity signal must not spam contacts. Adjustable.
 */
const REPEAT_NOTIFICATION_WINDOW_MS = 30 * 60_000;

@Injectable()
export class EmergencyContactNotificationService {
  private readonly logger = new Logger(
    EmergencyContactNotificationService.name,
  );

  constructor(
    @Inject(SMS_SENDER_PORT) private readonly sms: SmsSenderPort,
    private readonly emergencyContactRepository: EmergencyContactRepository,
    private readonly healthProfileRepository: HealthProfileRepository,
    private readonly notificationPreferencesRepository: NotificationPreferencesRepository,
    private readonly emergencyNotificationLogRepository: EmergencyNotificationLogRepository,
  ) {}

  /*
   * TODO(trigger): nothing calls this yet — by design. The trigger belongs in
   * the medication-safety pipeline, at the point a completed safety run's
   * severity is resolved. `resolveSafetyState()` in
   * src/guidance/contracts/safety-check-result.contract.ts returns a
   * ResolvedSafetyState whose `severity` is minor | moderate | major |
   * contraindicated. Once the clinical-policy decision on "which severity
   * escalates to an emergency contact" lands (pending — separate story), a
   * single guarded call goes there:
   *
   *   if (<resolved severity meets the clinical escalation threshold>) {
   *     await emergencyContactNotificationService.notify(
   *       run.patientId,
   *       'severe_medication_reaction',
   *     );
   *   }
   *
   * The threshold itself is deliberately NOT implemented here or anywhere in
   * this change. This service is standalone infrastructure only.
   */
  async notify(
    userId: number,
    event: EmergencyNotificationEvent,
  ): Promise<SmsSendResult[]> {
    const [contacts, profile] = await Promise.all([
      this.emergencyContactRepository.listByUserId(userId),
      this.healthProfileRepository.getEmergencyCardProfileByUserId(userId),
    ]);

    if (contacts.length === 0) {
      this.logger.warn(
        `No emergency contacts for userId=${userId}; ${event} notification not sent.`,
      );
      return [];
    }

    // Preference gate — same early-return shape as the zero-contacts branch.
    const smsEnabled =
      await this.notificationPreferencesRepository.getEmergencyContactSmsEnabled(
        userId,
      );

    if (!smsEnabled) {
      this.logger.warn(
        `Emergency-contact SMS disabled for userId=${userId}; ${event} notification not sent.`,
      );
      return [];
    }

    // Repeat guard — mirrors DoseNotificationProcessor's `alreadyNotified`
    // (a `!== null` check against a time-windowed lookup). A skipped attempt is
    // deliberately NOT written to the log table.
    const patientName =
      [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
      UNKNOWN_PATIENT;

    const message = EMERGENCY_NOTIFICATION_TEMPLATES[event](patientName);

    return this.emergencyNotificationLogRepository.runWithUserNotificationLock(
      userId,
      async () => {
        const since = new Date(Date.now() - REPEAT_NOTIFICATION_WINDOW_MS);

        const recentlyNotified =
          (await this.emergencyNotificationLogRepository.findRecentByUserId(
            userId,
            since,
          )) !== null;

        if (recentlyNotified) {
          this.logger.warn(
            `Emergency-contact notification for userId=${userId} skipped: one was ` +
              `already logged within the last ` +
              `${REPEAT_NOTIFICATION_WINDOW_MS / 60_000} minutes.`,
          );

          return [];
        }

        const results = await Promise.all(
          contacts.map(async (contact) => {
            const result = await this.sms.send(contact.phone, message);

            await this.emergencyNotificationLogRepository.record({
              userId,
              contactId: contact.id,
              event,
              status: result.status === 'ok' ? 'sent' : 'failed',
            });

            return result;
          }),
        );

        const failed = results.filter(
          (result) => result.status === 'error',
        ).length;

        this.logger.log(
          `${event} notification for userId=${userId}: ` +
            `${results.length - failed}/${results.length} SMS sent`,
        );

        return results;
      },
    );
  }
}
