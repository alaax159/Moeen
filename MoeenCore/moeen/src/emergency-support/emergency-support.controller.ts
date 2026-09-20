import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../users/current-user.decorator';
import { UserSyncGuard } from '../users/user-sync.guard';
import { EmergencyMedicalCardService } from './emergency-medical-card.service';
import { EmergencyAccessService } from './emergency-access.service';
import {
  EmergencyAccessEnableDto,
  EmergencyAccessMutationDto,
  EmergencyAccessStatusDto,
  EmergencyAccessTokenDto,
  EnableEmergencyAccessDto,
} from './dto/emergency-access.dto';

@ApiTags('emergency-support')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('api/emergency-support')
export class EmergencySupportController {
  constructor(
    private readonly emergencyMedicalCardService: EmergencyMedicalCardService,
    private readonly emergencyAccessService: EmergencyAccessService,
  ) {}

  @Get('card')
  getEmergencyMedicalCard(@CurrentUser() user: { id: number }) {
    return this.emergencyMedicalCardService.getEmergencyMedicalCard(user.id);
  }

  @Get('access')
  @ApiOkResponse({ type: EmergencyAccessStatusDto })
  getEmergencyAccessStatus(@CurrentUser() user: { id: number }) {
    return this.emergencyAccessService.getStatus(user.id);
  }

  @Post('access/enable')
  @ApiOkResponse({ type: EmergencyAccessEnableDto })
  enableEmergencyAccess(
    @CurrentUser() user: { id: number },
    @Body() dto: EnableEmergencyAccessDto,
  ) {
    return this.emergencyAccessService.enable(user.id, dto.expectedVersion);
  }

  @Post('access/regenerate')
  @ApiOkResponse({ type: EmergencyAccessTokenDto })
  regenerateEmergencyAccess(
    @CurrentUser() user: { id: number },
    @Body() dto: EmergencyAccessMutationDto,
  ) {
    return this.emergencyAccessService.regenerate(user.id, dto.expectedVersion);
  }

  @Post('access/disable')
  @ApiOkResponse({ type: EmergencyAccessStatusDto })
  disableEmergencyAccess(
    @CurrentUser() user: { id: number },
    @Body() dto: EmergencyAccessMutationDto,
  ) {
    return this.emergencyAccessService.disable(user.id, dto.expectedVersion);
  }
}
