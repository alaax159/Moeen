import { Platform } from "react-native";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";

import { handleReminderAction } from "./src/features/notifications/handleReminderAction";

const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, ({ data, error }) => {
  if (error) {
    console.warn("Background notification task error:", error);
    return;
  }

  const isNotificationResponse = data != null && "actionIdentifier" in data;
  if (!isNotificationResponse) {
    return;
  }

  const { actionIdentifier, notification } = data;
  const reminderData = notification?.request?.content?.data;
  const notificationIdentifier = notification?.request?.identifier;

  return handleReminderAction(actionIdentifier, notificationIdentifier, reminderData).catch((err) => {
    console.warn("Failed to handle background reminder action:", err);
  });
});

// Background notification tasks are native-only, so never register on web.
// Keeps the web entry free of a native-only call before expo-router/entry.
if (Platform.OS !== "web") {
  Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
}

require("expo-router/entry");
