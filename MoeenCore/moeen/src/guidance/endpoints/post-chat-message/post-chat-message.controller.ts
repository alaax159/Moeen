import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { FirebaseAuthGuard } from '../../../auth/firebase-auth.guard';
import { CurrentUser } from '../../../users/current-user.decorator';
import { UserSyncGuard } from '../../../users/user-sync.guard';
import { PostChatMessageDto } from './post-chat-message.dto';
import { PostChatMessageService } from './post-chat-message.service';

interface AuthenticatedUser {
  id: number;
}

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, UserSyncGuard)
@Controller('chat')
export class PostChatMessageController {
  constructor(
    private readonly postChatMessageService: PostChatMessageService,
  ) {}

  @Post('messages')
  async postMessage(
    @Body() body: PostChatMessageDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.postChatMessageService.postMessage(user.id, body);

    response.status(HttpStatus.OK);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    if (
      !(await this.writeEvent(response, 'session', {
        sessionId: result.sessionId,
      }))
    ) {
      return;
    }

    for (const chunk of this.streamChunks(result.response.text)) {
      if (
        !(await this.writeEvent(response, 'delta', {
          text: chunk,
        }))
      ) {
        return;
      }
    }

    if (
      !(await this.writeEvent(response, 'done', {
        citations: result.response.citationIds,
        validationStatus: result.response.validationStatus,
        promptVersion: result.response.promptVersion,
        // Present only once ESCALATION_THRESHOLD is set (null today → omitted).
        ...(result.response.escalation
          ? { escalation: result.response.escalation }
          : {}),
      }))
    ) {
      return;
    }

    if (!this.isClosed(response)) {
      response.end();
    }
  }

  private streamChunks(text: string): string[] {
    return text.match(/\S+\s*/g) ?? (text ? [text] : []);
  }

  private isClosed(response: Response): boolean {
    return response.destroyed || response.writableEnded;
  }

  private async writeEvent(
    response: Response,
    event: string,
    data: unknown,
  ): Promise<boolean> {
    if (this.isClosed(response)) {
      return false;
    }

    const writable = response.write(
      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
    );

    if (writable) {
      return !this.isClosed(response);
    }

    return this.waitForDrainOrClose(response);
  }

  private waitForDrainOrClose(response: Response): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;

      const finish = (canContinue: boolean) => {
        if (settled) {
          return;
        }

        settled = true;

        response.off('drain', onDrain);
        response.off('close', onClose);
        response.off('error', onError);

        resolve(canContinue);
      };

      const onDrain = () => finish(!this.isClosed(response));
      const onClose = () => finish(false);
      const onError = () => finish(false);

      response.once('drain', onDrain);
      response.once('close', onClose);
      response.once('error', onError);

      if (this.isClosed(response)) {
        finish(false);
      }
    });
  }
}
