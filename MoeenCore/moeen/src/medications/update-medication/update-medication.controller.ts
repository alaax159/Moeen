import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { UserSyncGuard } from '../../users/user-sync.guard';
import { CurrentFirebaseUid } from '../../auth/current-firebase-uid.decorator';

import { UpdateMedicationDto } from '../dto/update-medication.dto';
import { UpdateMedicationService } from './update-medication.service';

@ApiTags('medications')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('medications')
export class UpdateMedicationController {
  constructor(
    private readonly updateMedicationService: UpdateMedicationService,
  ) {}

  @Patch(':id')
  update(
    @CurrentFirebaseUid() firebaseUid: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMedicationDto,
  ) {
    return this.updateMedicationService.update(id, dto, firebaseUid);
  }
}
