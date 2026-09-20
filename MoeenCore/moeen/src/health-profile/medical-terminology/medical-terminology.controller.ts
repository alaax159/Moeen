import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { UserSyncGuard } from '../../users/user-sync.guard';
import { MedicalTerminologyService } from './medical-terminology.service';

@ApiTags('health-profile')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('api/health-profile')
export class MedicalTerminologyController {
  constructor(
    private readonly medicalTerminologyService: MedicalTerminologyService,
  ) {}

  @Get('allergies')
  searchAllergies(@Query('search') search?: string) {
    const searchTerm = this.getSearchTerm(search);
    return this.medicalTerminologyService.searchAllergies(searchTerm);
  }

  @Get('chronic-conditions')
  searchChronicConditions(@Query('search') search?: string) {
    const searchTerm = this.getSearchTerm(search);
    return this.medicalTerminologyService.searchChronicConditions(searchTerm);
  }

  private getSearchTerm(search?: string) {
    const searchTerm = search?.trim();

    if (!searchTerm) {
      throw new BadRequestException('Search term is required');
    }

    return searchTerm;
  }
}
