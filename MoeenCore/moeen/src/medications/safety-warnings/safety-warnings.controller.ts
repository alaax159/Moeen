import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { CurrentFirebaseUid } from '../../auth/current-firebase-uid.decorator';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { UserSyncGuard } from '../../users/user-sync.guard';

import { SafetyWarningsResponseDto } from './dto/safety-warnings-response.dto';
import { SafetyWarningsService } from './safety-warnings.service';

@ApiTags('medications')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('api/medications')
export class SafetyWarningsController {
  constructor(private readonly safetyWarningsService: SafetyWarningsService) {}

  @Get('safety-warnings')
  @ApiOkResponse({ type: SafetyWarningsResponseDto })
  getSafetyWarnings(@CurrentFirebaseUid() firebaseUid: string) {
    return this.safetyWarningsService.getSafetyWarnings(firebaseUid);
  }
}
