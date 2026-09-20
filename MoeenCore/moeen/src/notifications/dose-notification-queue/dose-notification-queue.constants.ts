export const DOSE_NOTIFICATIONS_QUEUE = 'dose-notifications';

export const SEND_DOSE_NOTIFICATION_JOB = 'send-dose';
export const SEND_FOLLOW_UP_NOTIFICATION_JOB = 'send-follow-up';
export const REFILL_DOSE_WINDOW_JOB = 'refill-dose-window';
export const CHECK_DOSE_MISSED_JOB = 'check-dose-missed';

export const DOSE_NOTIFICATION_TIMEZONE = 'Asia/Jerusalem';

// How far ahead dose_log rows + queue jobs are generated in one pass.
export const DOSE_GENERATION_WINDOW_DAYS = 30;

// How many days before the generated window runs out the refill job fires
// to generate the next window (self-chaining, no cron involved).
export const DOSE_REFILL_LEAD_DAYS = 5;

// How long after the scheduled time a still-"pending" dose is considered
// missed, checked via a delayed job (no cron involved).
export const DOSE_MISSED_GRACE_MINUTES = 30;

// Must stay in sync with MoeenApp's DOSE_REMINDER_CATEGORY
// (MoeenApp/src/features/notifications/registerForPushNotifications.ts), which
// registers this identifier on-device via Notifications.setNotificationCategoryAsync
// so native action buttons (Snooze/Dismiss) attach to pushes carrying this
// categoryId. No automated cross-repo enforcement exists — this is the first
// place this contract is made explicit; change both together.
export const DOSE_REMINDER_CATEGORY = 'dose-reminder';

export type SendDoseNotificationJobData = {
  doseLogId: number;
  userMedicationId: number;
  scheduleTimeId: number | null;
  userId: number;
  date: string;
  /**
   * Set only by DoseScheduleService.requeueSendDose (the snooze path). Tells
   * handleSendDose this re-fire is a deliberate "remind me again", so it must
   * send the push even though notifiedAt is already set — distinguishing it
   * from a BullMQ crash-retry of the original job, which carries no such flag.
   */
  isSnoozeReschedule?: boolean;
};

export type SendFollowUpNotificationJobData = {
  doseLogId: number;
  userId: number;
  date: string;
};

export type RefillDoseWindowJobData = {
  userMedicationId: number;
};

export type CheckDoseMissedJobData = {
  doseLogId: number;
};
