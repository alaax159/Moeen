import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { UserSyncGuard } from '../../users/user-sync.guard';
import { CurrentFirebaseUid } from '../../auth/current-firebase-uid.decorator';

import { ListMedicationService } from './list-medication.service';
import { GetMedicationsDto } from '../dto/get-medications.dto';

@ApiTags('medications')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('medications')
export class MedicationsController {
  constructor(private readonly listMedicationService: ListMedicationService) {}

  @Get('get_User_medications')
  getMedications(
    @CurrentFirebaseUid() firebaseUid: string,
    @Query() query: GetMedicationsDto,
  ) {
    return this.listMedicationService.getMedications(firebaseUid, query.status);
  }
  @Get('today')
  getTodayMedications(@CurrentFirebaseUid() firebaseUid: string) {
    return this.listMedicationService.getTodayMedications(firebaseUid);
  }
  @Post('schedule-times/:id/taken')
  markDoseTaken(
    @CurrentFirebaseUid() firebaseUid: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.listMedicationService.markDoseTaken(id, firebaseUid);
  }

  @Post('schedule-times/:id/skip')
  markDoseSkipped(
    @CurrentFirebaseUid() firebaseUid: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.listMedicationService.markDoseSkipped(id, firebaseUid);
  }

  @Post('schedule-times/:id/snooze')
  snoozeDose(
    @CurrentFirebaseUid() firebaseUid: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.listMedicationService.snoozeDose(id, firebaseUid);
  }

  @Post('schedule-times/:id/dismiss')
  dismissDose(
    @CurrentFirebaseUid() firebaseUid: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.listMedicationService.dismissDose(id, firebaseUid);
  }
}
