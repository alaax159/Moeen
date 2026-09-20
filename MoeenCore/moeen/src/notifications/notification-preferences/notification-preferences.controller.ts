import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentFirebaseUid } from '../../auth/current-firebase-uid.decorator';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { UserSyncGuard } from '../../users/user-sync.guard';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { NotificationPreferencesService } from './notification-preferences.service';

@ApiTags('notification-preferences')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('notification-preferences')
export class NotificationPreferencesController {
  constructor(
    private readonly notificationPreferencesService: NotificationPreferencesService,
  ) {}

  @Get()
  get(@CurrentFirebaseUid() firebaseUid: string) {
    return this.notificationPreferencesService.get(firebaseUid);
  }

  @Put()
  update(
    @CurrentFirebaseUid() firebaseUid: string,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationPreferencesService.update(firebaseUid, dto);
  }
}
