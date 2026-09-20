import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { UserSyncGuard } from '../../users/user-sync.guard';

import {
  CurrentFirebaseUid,
  CurrentFirebaseUser,
  FirebaseUserIdentity,
} from '../../auth/current-firebase-uid.decorator';
import { SavePersonalInfoDto } from '../dto/save-personal-info.dto';
import { UpdateKnowledgeStatusDto } from '../dto/update-knowledge-status.dto';
import { PersonalInfoService } from './personal-info.service';

@ApiTags('health-profile')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('api/health-profile')
export class PersonalInfoController {
  constructor(private readonly personalInfoService: PersonalInfoService) {}

  @Post()
  create(@CurrentFirebaseUid() firebaseUid: string) {
    return this.personalInfoService.create(firebaseUid);
  }

  @Get()
  get(@CurrentFirebaseUid() firebaseUid: string) {
    return this.personalInfoService.get(firebaseUid);
  }

  @Get('knowledge-status')
  getKnowledgeStatus(@CurrentFirebaseUid() firebaseUid: string) {
    return this.personalInfoService.getKnowledgeStatus(firebaseUid);
  }

  @Put('knowledge-status')
  updateKnowledgeStatus(
    @CurrentFirebaseUid() firebaseUid: string,
    @Body() dto: UpdateKnowledgeStatusDto,
  ) {
    return this.personalInfoService.updateKnowledgeStatus(firebaseUid, dto);
  }

  @Put('personal-info')
  updatePersonalInfo(
    @CurrentFirebaseUser() firebaseUser: FirebaseUserIdentity,
    @Body() dto: SavePersonalInfoDto,
  ) {
    return this.personalInfoService.updatePersonalInfo(firebaseUser, dto);
  }
}
