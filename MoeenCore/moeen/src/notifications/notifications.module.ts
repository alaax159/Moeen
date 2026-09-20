import { Module } from '@nestjs/common';

import { DoseNotificationQueueModule } from './dose-notification-queue/dose-notification-queue.module';
import { NotificationPreferencesController } from './notification-preferences/notification-preferences.controller';
import { NotificationPreferencesService } from './notification-preferences/notification-preferences.service';

@Module({
  imports: [DoseNotificationQueueModule],
  controllers: [NotificationPreferencesController],
  providers: [NotificationPreferencesService],
})
export class NotificationsModule {}
