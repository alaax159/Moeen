import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { UserSyncGuard } from '../../users/user-sync.guard';
import { CurrentFirebaseUid } from '../../auth/current-firebase-uid.decorator';
import {
  CreateAllergyDto,
  CreateChronicConditionDto,
} from '../dto/addAllergiesAndChronicCondition.dto';
import { AllergiesAndChronicConditionsService } from './allergiesAndChronicConditions.service';

@ApiTags('allergies-conditions')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('api/health-profile')
export class AllergiesAndChronicConditionsController {
  constructor(
    private readonly allergiesAndChronicConditionsService: AllergiesAndChronicConditionsService,
  ) {}

  @Post('allergies')
  createAllergy(
    @CurrentFirebaseUid() firebaseUid: string,
    @Body() dto: CreateAllergyDto,
  ) {
    return this.allergiesAndChronicConditionsService.createAllergy(
      firebaseUid,
      dto,
    );
  }

  @Get('allergies/user')
  getAllergies(@CurrentFirebaseUid() firebaseUid: string) {
    return this.allergiesAndChronicConditionsService.getAllergies(firebaseUid);
  }

  @Delete('allergies/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivateAllergy(
    @CurrentFirebaseUid() firebaseUid: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.allergiesAndChronicConditionsService.deactivateAllergy(
      firebaseUid,
      id,
    );
  }

  @Post('chronic-conditions')
  createChronicCondition(
    @CurrentFirebaseUid() firebaseUid: string,
    @Body() dto: CreateChronicConditionDto,
  ) {
    return this.allergiesAndChronicConditionsService.createChronicCondition(
      firebaseUid,
      dto,
    );
  }

  @Get('chronic-conditions/user')
  getChronicConditions(@CurrentFirebaseUid() firebaseUid: string) {
    return this.allergiesAndChronicConditionsService.getChronicConditions(
      firebaseUid,
    );
  }

  @Delete('chronic-conditions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivateChronicCondition(
    @CurrentFirebaseUid() firebaseUid: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.allergiesAndChronicConditionsService.deactivateChronicCondition(
      firebaseUid,
      id,
    );
  }
}
