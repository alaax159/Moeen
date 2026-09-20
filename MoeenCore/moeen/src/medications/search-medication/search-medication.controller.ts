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
import { MedicationsService } from './search-medication.service';

@ApiTags('medications')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('medications')
export class MedicationsController {
  constructor(private readonly medicationsService: MedicationsService) {}

  @Get('search')
  search(@Query('query') query?: string) {
    const searchTerm = query?.trim();

    if (!searchTerm) {
      throw new BadRequestException('Query is required');
    }

    return this.medicationsService.search(searchTerm);
  }
}
