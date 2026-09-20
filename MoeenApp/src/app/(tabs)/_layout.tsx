import AppTabs from '@/components/app-tabs';
import { useColdLaunchNotificationResponse } from '@/features/notifications/useColdLaunchNotificationResponse';
import { useNotificationResponseListener } from '@/features/notifications/useNotificationResponseListener';
import { usePushNotifications } from '@/features/notifications/usePushNotifications';

export default function TabsLayout() {
  usePushNotifications();
  useNotificationResponseListener();
  useColdLaunchNotificationResponse();

  return <AppTabs />;
}