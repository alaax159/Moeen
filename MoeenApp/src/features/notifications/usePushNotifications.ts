import { useEffect, useState } from "react";

import { updateNotificationPreferences } from "@/features/notification-preferences/api";

import {
    PushRegistrationError,
    registerForPushNotificationsAsync,
} from "./registerForPushNotifications";

type PushNotificationsStatus = "idle" | "loading" | "saved" | "error";

export function usePushNotifications() {
  const [status, setStatus] = useState<PushNotificationsStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function register() {
      setStatus("loading");
      try {
        const { pushToken, deviceType } = await registerForPushNotificationsAsync();
        console.log("Expo Push Token:", pushToken, "| deviceType:", deviceType);

        await updateNotificationPreferences({
          expoPushToken: pushToken,
          deviceType,
        });

        if (isMounted) setStatus("saved");
      } catch (error) {
        if (!isMounted) return;
        setStatus("error");

        if (error instanceof PushRegistrationError) {
          console.warn("Push notification setup stopped:", error.message);
          setErrorMessage(error.message);
        } else if (error instanceof Error) {
          console.warn("Failed to save notification preferences:", error.message);
          setErrorMessage(error.message);
        } else {
          setErrorMessage("Something went wrong while setting up notifications.");
        }
      }
    }

    register();
    return () => {
      isMounted = false;
    };
  }, []);

  return { status, errorMessage };
}