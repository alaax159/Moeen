import * as Notifications from "expo-notifications";
import { router, useNavigationContainerRef } from "expo-router";
import { useEffect } from "react";

import {
  handleReminderAction,
  type ReminderData,
} from "./handleReminderAction";
import { isActionButtonResponse } from "./registerForPushNotifications";

export function useNotificationResponseListener() {
  const navigationContainerRef = useNavigationContainerRef();

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | ReminderData
          | undefined;

        if (isActionButtonResponse(response.actionIdentifier)) {
          handleReminderAction(
            response.actionIdentifier,
            response.notification.request.identifier,
            data,
          ).catch((error) => {
            console.warn("Failed to handle reminder action:", error);
          });
          return;
        }

        if (data?.scheduleTimeId === undefined) {
          console.warn(
            "Notification tapped without a scheduleTimeId, data:",
            data,
          );
          router.push("/");
          return;
        }

        const currentRoute = navigationContainerRef.current?.getCurrentRoute() as
          | { name?: string }
          | undefined;
        const isHomeFocused = currentRoute?.name === "index";

        if (isHomeFocused) {
          router.setParams({ scheduleTimeId: String(data.scheduleTimeId) });
        } else {
          // Fallback for cross-tab navigation (tapped while on a different
          // tab) — NOT confirmed safe against the same-route NAVIGATE
          // crash; push is the only mechanism available for an actual tab
          // switch. Needs real on-device verification (tap while on
          // Profile/Meds/Reports) before this can be considered resolved.
          router.push({
            pathname: "/",
            params: { scheduleTimeId: String(data.scheduleTimeId) },
          });
        }
      },
    );

    return () => subscription.remove();
  }, []);
}
