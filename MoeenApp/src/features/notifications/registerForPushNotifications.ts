import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { DeviceType } from "@/features/notification-preferences/types";

export class PushRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PushRegistrationError";
  }
}

export const DOSE_REMINDER_CATEGORY = "dose-reminder";
export const DISMISS_ACTION = "dismiss";
export const SNOOZE_ACTION = "snooze";

export function isActionButtonResponse(actionIdentifier: string): boolean {
  return actionIdentifier === SNOOZE_ACTION || actionIdentifier === DISMISS_ACTION;
}

// Controls what happens if a notification arrives WHILE the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function configureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync("default", {
    name: "Medication reminders",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#2F9E58",
  });
}

async function configureNotificationCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(DOSE_REMINDER_CATEGORY, [
    {
      identifier: SNOOZE_ACTION,
      buttonTitle: "Snooze",
      options: {
        opensAppToForeground: false,
      },
    },
    {
      identifier: DISMISS_ACTION,
      buttonTitle: "Dismiss",
      options: {
        opensAppToForeground: false,
      },
    },
  ]);
}

export async function registerForPushNotificationsAsync(): Promise<{
  pushToken: string;
  deviceType: DeviceType;
}> {
  await configureAndroidNotificationChannel();
  await configureNotificationCategories();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    throw new PushRegistrationError("Notification permission was not granted.");
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    throw new PushRegistrationError("Missing EAS project ID in app.json.");
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });

  const deviceType: DeviceType = !Device.isDevice
    ? "emulator"
    : Platform.OS === "android"
      ? "android"
      : "ios";

  return {
    pushToken: tokenData.data,
    deviceType,
  };
}