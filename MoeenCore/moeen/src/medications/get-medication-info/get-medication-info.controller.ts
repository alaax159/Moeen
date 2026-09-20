import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { UserSyncGuard } from '../../users/user-sync.guard';
import { CurrentFirebaseUid } from '../../auth/current-firebase-uid.decorator';

import { GetMedicationInfoService } from './get-medication-info.service';

@ApiTags('medications')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('get-medication-info')
export class GetMedicationInfoController {
  constructor(
    private readonly getMedicationInfoService: GetMedicationInfoService,
  ) {}

  @Get(':id')
  getMedicationInfo(
    @CurrentFirebaseUid() firebaseUid: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.getMedicationInfoService.getMedicationInfo(id, firebaseUid);
  }
}
