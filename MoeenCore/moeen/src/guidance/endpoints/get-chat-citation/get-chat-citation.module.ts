import { Module } from '@nestjs/common';

import { GetChatCitationController } from './get-chat-citation.controller';
import { GetChatCitationService } from './get-chat-citation.service';

@Module({
  controllers: [GetChatCitationController],
  providers: [GetChatCitationService],
})
export class GetChatCitationModule {}
