import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { router, useNavigationContainerRef } from "expo-router";

import { isActionButtonResponse } from "./registerForPushNotifications";
import type { ReminderData } from "./handleReminderAction";

export function useColdLaunchNotificationResponse() {
  const lastResponse = Notifications.useLastNotificationResponse();
  const navigationContainerRef = useNavigationContainerRef();

  useEffect(() => {
    if (!lastResponse) {
      return; // undefined = not resolved yet, null = no response
    }

    const currentRoute = navigationContainerRef.current?.getCurrentRoute() as
      | { name?: string }
      | undefined;

    // TEMP: confirms whether Home is already the focused tab during cold
    // launch, before deciding whether this hook needs the same
    // isHomeFocused branching as the warm listener. Remove after testing.
    console.log("[ColdLaunch] getCurrentRoute()?.name:", currentRoute?.name);

    if (!isActionButtonResponse(lastResponse.actionIdentifier)) {
      const data = lastResponse.notification.request.content.data as
        | ReminderData
        | undefined;

      if (data?.scheduleTimeId === undefined) {
        console.warn(
          "Cold-launch notification tap without a scheduleTimeId, data:",
          data,
        );
      } else {
        const isHomeFocused = currentRoute?.name === "index";

        if (isHomeFocused) {
          router.setParams({ scheduleTimeId: String(data.scheduleTimeId) });
        } else {
          // Fallback for cross-tab navigation — NOT confirmed safe against
          // the same-route NAVIGATE crash; push is the only mechanism
          // available for an actual tab switch. Needs real on-device
          // verification (tap while on Profile/Meds/Reports) before this
          // can be considered resolved.
          router.push({
            pathname: "/",
            params: { scheduleTimeId: String(data.scheduleTimeId) },
          });
        }
      }
    }

    Notifications.clearLastNotificationResponseAsync().catch((error) => {
      console.warn("Failed to clear last notification response:", error);
    });
  }, [lastResponse]);
}
