import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { FirebaseAuthGuard } from '../../../auth/firebase-auth.guard';
import { UserSyncGuard } from '../../../users/user-sync.guard';
import { GetChatCitationService } from './get-chat-citation.service';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('chat/citations')
export class GetChatCitationController {
  constructor(
    private readonly getChatCitationService: GetChatCitationService,
  ) {}

  @Get(':citationId')
  getCitation(@Param('citationId') citationId: string) {
    return this.getChatCitationService.getCitation(citationId);
  }
}
