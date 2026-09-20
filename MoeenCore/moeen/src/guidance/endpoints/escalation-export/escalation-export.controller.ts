import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { FirebaseAuthGuard } from '../../../auth/firebase-auth.guard';
import { CurrentUser } from '../../../users/current-user.decorator';
import { UserSyncGuard } from '../../../users/user-sync.guard';

import { EscalationExportResponseDto } from './dto/escalation-export-response.dto';
import { EscalationExportService } from './escalation-export.service';

interface AuthenticatedUser {
  id: number;
}

@ApiTags('escalation')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('escalation')
export class EscalationExportController {
  constructor(
    private readonly escalationExportService: EscalationExportService,
  ) {}

  @Get('export')
  @ApiOkResponse({ type: EscalationExportResponseDto })
  getExport(@CurrentUser() user: AuthenticatedUser) {
    return this.escalationExportService.getExport(user.id);
  }
}
