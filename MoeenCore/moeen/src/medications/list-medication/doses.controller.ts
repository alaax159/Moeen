import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { UserSyncGuard } from '../../users/user-sync.guard';
import { CurrentFirebaseUid } from '../../auth/current-firebase-uid.decorator';

import { ListMedicationService } from './list-medication.service';

@ApiTags('medications')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('doses')
export class DosesController {
  constructor(private readonly listMedicationService: ListMedicationService) {}

  @Get('today')
  getTodayDoses(@CurrentFirebaseUid() firebaseUid: string) {
    return this.listMedicationService.getTodayDoses(firebaseUid);
  }

  @Get('adherence-summary')
  getAdherenceSummary(@CurrentFirebaseUid() firebaseUid: string) {
    return this.listMedicationService.getAdherenceSummary(firebaseUid);
  }

  @Get('weekly')
getWeeklyDoses(@CurrentFirebaseUid() firebaseUid: string) {
  return this.listMedicationService.getWeeklyDoses(firebaseUid);
}
}
