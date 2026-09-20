import {
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

import { ArchiveMedicationService } from './archive-medication.service';

@ApiTags('medications')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('medications')
export class MedicationsController {
  constructor(
    private readonly archiveMedicationService: ArchiveMedicationService,
  ) {}

  @Patch(':id/archive')
  archive(
    @CurrentFirebaseUid() firebaseUid: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.archiveMedicationService.archive(id, firebaseUid);
  }
}
