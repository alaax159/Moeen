import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '../../../database/database.module';
import { OrchestratorModule } from '../../orchestrator/orchestrator.module';
import { ChatHistoryService } from './chat-history.service';
import { ChatIntentClassifier } from './chat-intent-classifier.service';
import { ChatRepository } from './chat.repository';
import { PostChatMessageController } from './post-chat-message.controller';
import { PostChatMessageService } from './post-chat-message.service';

@Module({
  imports: [ConfigModule, DatabaseModule, OrchestratorModule],
  controllers: [PostChatMessageController],
  providers: [
    PostChatMessageService,
    ChatRepository,
    ChatIntentClassifier,
    ChatHistoryService,
  ],
})
export class PostChatMessageModule {}
