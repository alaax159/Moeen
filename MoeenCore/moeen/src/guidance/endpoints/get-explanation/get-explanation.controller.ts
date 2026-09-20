import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { FirebaseAuthGuard } from '../../../auth/firebase-auth.guard';
import { UserSyncGuard } from '../../../users/user-sync.guard';
import { CurrentUser } from '../../../users/current-user.decorator';

import { GetExplanationService } from './get-explanation.service';

interface AuthenticatedUser {
  id: number;
}

@ApiTags('safety-checks')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('safety-checks')
export class GetExplanationController {
  constructor(private readonly getExplanationService: GetExplanationService) {}

  @Get(':id/explanation')
  getExplanation(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.getExplanationService.getExplanation(id, user.id);
  }
}
