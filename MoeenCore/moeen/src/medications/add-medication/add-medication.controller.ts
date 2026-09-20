import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { UserSyncGuard } from '../../users/user-sync.guard';
import { CurrentFirebaseUid } from '../../auth/current-firebase-uid.decorator';

import { AddMedicationService } from './add-medication.service';
import { AddMedicationDto } from '../dto/add-medication.dto';

@ApiTags('medications')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('medication')
export class AddMedicationController {
  constructor(private readonly addMedicationService: AddMedicationService) {}

  @Post('add-medication')
  create(
    @CurrentFirebaseUid() firebaseUid: string,
    @Body() dto: AddMedicationDto,
  ) {
    return this.addMedicationService.create(dto, firebaseUid);
  }

  @Post('add-medication/check-safety')
  checkSafety(
    @CurrentFirebaseUid() firebaseUid: string,
    @Body() dto: AddMedicationDto,
  ) {
    return this.addMedicationService.checkSafety(dto, firebaseUid);
  }
}
