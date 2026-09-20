import * as Notifications from "expo-notifications";

import { auth } from "@/firebase/config";
import { markDoseDismissed, markDoseSnoozed } from "@/features/schedule/api";

import { DISMISS_ACTION, SNOOZE_ACTION } from "./registerForPushNotifications";

export type ReminderData = {
  scheduleTimeId?: number;
  userMedicationId?: number;
};

async function dismissTrayNotification(
  notificationIdentifier: string,
): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(notificationIdentifier);
  } catch (error) {
    console.warn("Failed to dismiss tray notification:", error);
  }
}

export async function handleReminderAction(
  actionIdentifier: string,
  notificationIdentifier: string,
  data?: ReminderData,
): Promise<void> {
  await auth.authStateReady();

  if (actionIdentifier === SNOOZE_ACTION) {
    if (data?.scheduleTimeId === undefined) {
      console.warn(
        "Snooze reminder tapped without a scheduleTimeId, data:",
        data,
      );
      return;
    }

    await markDoseSnoozed(data.scheduleTimeId).catch((error) => {
      console.warn("Failed to snooze dose:", error);
    });
    await dismissTrayNotification(notificationIdentifier);
    return;
  }

  if (actionIdentifier === DISMISS_ACTION) {
    if (data?.scheduleTimeId === undefined) {
      console.warn(
        "Dismiss reminder tapped without a scheduleTimeId, data:",
        data,
      );
      return;
    }

    await markDoseDismissed(data.scheduleTimeId).catch((error) => {
      console.warn("Failed to dismiss dose:", error);
    });
    await dismissTrayNotification(notificationIdentifier);
  }
}
