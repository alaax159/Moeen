import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentFirebaseUid } from '../auth/current-firebase-uid.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UserSyncGuard } from '../users/user-sync.guard';
import { ActiveInteractionsService } from './active-interactions.service';

@ApiTags('medication-safety')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('medication-safety')
export class ActiveInteractionsController {
  constructor(
    private readonly activeInteractionsService: ActiveInteractionsService,
  ) {}

  @Get('active-interactions')
  getActiveInteractions(@CurrentFirebaseUid() firebaseUid: string) {
    return this.activeInteractionsService.getActiveInteractions(firebaseUid);
  }
}
