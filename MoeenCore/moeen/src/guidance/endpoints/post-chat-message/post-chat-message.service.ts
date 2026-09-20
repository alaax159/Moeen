import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { UserMedicationRepository } from '../../../database/repository/user-medication.repository';
import type { GuidanceIntent, GuidanceResponse } from '../../contracts';
import { isPipelineFailure } from '../../orchestrator/pipeline-failure';
import { PipelineOrchestrator } from '../../orchestrator/pipeline-orchestrator.service';
import {
  ChatRepository,
  DuplicateChatRequestError,
  type StoredChatRequest,
} from './chat.repository';
import { ChatHistoryService } from './chat-history.service';
import { ChatIntentClassifier } from './chat-intent-classifier.service';
import { buildDeterministicChatRefusal } from './deterministic-chat-refusal';
import { PostChatMessageDto } from './post-chat-message.dto';

export interface PostChatMessageResult {
  sessionId: number;
  response: GuidanceResponse;
}

@Injectable()
export class PostChatMessageService {
  private readonly logger = new Logger(PostChatMessageService.name);

  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly orchestrator: PipelineOrchestrator,
    private readonly intentClassifier: ChatIntentClassifier,
    private readonly chatHistoryService: ChatHistoryService,
    private readonly userMedicationRepository: UserMedicationRepository,
  ) {}

  async postMessage(
    patientId: number,
    input: PostChatMessageDto,
  ): Promise<PostChatMessageResult> {
    const existing = await this.chatRepository.findRequest(
      patientId,
      input.requestId,
    );

    if (existing) {
      return this.resumeExistingRequest(patientId, input, existing);
    }

    let userMessageId: number;
    let sessionId: number;

    if (input.sessionId) {
      const session = await this.chatRepository.findSessionForUser(
        input.sessionId,
        patientId,
      );

      if (!session) {
        throw new NotFoundException('Chat session not found');
      }

      this.assertReusableSessionMedication(
        session.subjectMedicationId,
        input.subjectMedicationId,
      );

      const claimed = await this.chatRepository.insertUserMessage(
        input.sessionId,
        input.requestId,
        input.message,
      );

      if (!claimed) {
        return this.resolveDuplicateRequest(patientId, input);
      }

      sessionId = claimed.sessionId;
      userMessageId = claimed.userMessageId;
    } else {
      try {
        const claimed =
          await this.chatRepository.createSessionWithInitialMessage(
            patientId,
            input.subjectMedicationId,
            input.requestId,
            input.message,
          );

        sessionId = claimed.sessionId;
        userMessageId = claimed.userMessageId;
      } catch (error) {
        if (error instanceof DuplicateChatRequestError) {
          return this.resolveDuplicateRequest(patientId, input);
        }

        throw error;
      }
    }

    return this.generateAndPersist(patientId, input, sessionId, userMessageId);
  }

  private async resolveDuplicateRequest(
    patientId: number,
    input: PostChatMessageDto,
  ): Promise<PostChatMessageResult> {
    const existing = await this.chatRepository.findRequest(
      patientId,
      input.requestId,
    );

    if (!existing) {
      throw new ConflictException('Request ID is already in use');
    }

    return this.resumeExistingRequest(patientId, input, existing);
  }

  private async resumeExistingRequest(
    patientId: number,
    input: PostChatMessageDto,
    existing: StoredChatRequest,
  ): Promise<PostChatMessageResult> {
    this.assertExistingRequestScope(input, existing);

    if (existing.userContent !== input.message) {
      throw new ConflictException(
        'Request ID cannot be reused for different content',
      );
    }

    if (existing.status === 'completed') {
      if (!existing.response) {
        throw new InternalServerErrorException(
          'Completed chat request is missing its response',
        );
      }

      return {
        sessionId: existing.sessionId,
        response: existing.response,
      };
    }

    if (existing.status === 'processing') {
      throw new ConflictException('Chat request is already processing');
    }

    if (existing.status !== 'failed') {
      throw new InternalServerErrorException(
        'Chat request has an invalid processing state',
      );
    }

    const claimed = await this.chatRepository.claimFailedRequest(
      existing.userMessageId,
    );

    if (!claimed) {
      return this.resolveContendedRetry(patientId, input);
    }

    return this.generateAndPersist(
      patientId,
      input,
      existing.sessionId,
      existing.userMessageId,
    );
  }

  private async resolveContendedRetry(
    patientId: number,
    input: PostChatMessageDto,
  ): Promise<PostChatMessageResult> {
    const current = await this.chatRepository.findRequest(
      patientId,
      input.requestId,
    );

    if (!current) {
      throw new ConflictException(
        'Chat request state changed; retry the request',
      );
    }

    if (current.userContent !== input.message) {
      throw new ConflictException(
        'Request ID cannot be reused for different content',
      );
    }

    if (current.status === 'completed' && current.response) {
      return {
        sessionId: current.sessionId,
        response: current.response,
      };
    }

    throw new ConflictException('Chat request is already processing');
  }

  private async generateAndPersist(
    patientId: number,
    input: PostChatMessageDto,
    sessionId: number,
    userMessageId: number,
  ): Promise<PostChatMessageResult> {
    try {
      return await this.executeRequest(
        patientId,
        input,
        sessionId,
        userMessageId,
      );
    } catch (error) {
      await this.markFailedSafely(userMessageId);
      throw error;
    }
  }

  private async executeRequest(
    patientId: number,
    input: PostChatMessageDto,
    sessionId: number,
    userMessageId: number,
  ): Promise<PostChatMessageResult> {
    const classification = this.intentClassifier.classify(input.message);

    const shouldRefuse =
      classification.kind === 'refusal' ||
      input.subjectMedicationId === undefined ||
      !(await this.userMedicationRepository.isActiveMedicationForUser(
        patientId,
        input.subjectMedicationId,
      ));

    if (shouldRefuse) {
      return this.persistResponse(
        patientId,
        input,
        sessionId,
        userMessageId,
        buildDeterministicChatRefusal(),
      );
    }

    const question =
      classification.intent === 'medication_question'
        ? await this.chatHistoryService.buildQuestion(sessionId, input.message)
        : undefined;

    const response = await this.runPipeline(
      patientId,
      input,
      classification.intent,
      question,
    );

    return this.persistResponse(
      patientId,
      input,
      sessionId,
      userMessageId,
      response,
    );
  }

  private async runPipeline(
    patientId: number,
    input: PostChatMessageDto,
    intent: Extract<GuidanceIntent, 'medication_question' | 'missed_dose'>,
    question: string | undefined,
  ): Promise<GuidanceResponse> {
    try {
      return await this.orchestrator.run(
        {
          patientId,
          intent,
          subjectMedicationId: input.subjectMedicationId,
          ...(question !== undefined ? { question } : {}),
        },
        'patient_chat',
      );
    } catch (error) {
      if (isPipelineFailure(error)) {
        throw new InternalServerErrorException(
          'Failed to generate chat response',
        );
      }

      throw error;
    }
  }

  private async persistResponse(
    patientId: number,
    input: PostChatMessageDto,
    sessionId: number,
    userMessageId: number,
    response: GuidanceResponse,
  ): Promise<PostChatMessageResult> {
    // NOTE: response.escalation is not persisted — chat_message stores columns,
    // not the whole payload, and escalation is always undefined while
    // ESCALATION_THRESHOLD is null. Whoever sets that threshold must also add
    // persistence so a resumed/duplicate request replays the escalation.
    const completed = await this.chatRepository.completeRequest(
      userMessageId,
      sessionId,
      input.requestId,
      response,
    );

    if (!completed) {
      const stored = await this.chatRepository.findRequest(
        patientId,
        input.requestId,
      );

      if (stored?.status === 'completed' && stored.response) {
        return {
          sessionId: stored.sessionId,
          response: stored.response,
        };
      }

      throw new InternalServerErrorException('Failed to persist chat response');
    }

    return {
      sessionId,
      response,
    };
  }

  private assertExistingRequestScope(
    input: PostChatMessageDto,
    existing: StoredChatRequest,
  ): void {
    if (
      input.sessionId !== undefined &&
      input.sessionId !== existing.sessionId
    ) {
      throw new ConflictException(
        'Request ID cannot be reused for a different chat session',
      );
    }

    const requestedSubjectMedicationId = input.subjectMedicationId ?? null;

    if (existing.subjectMedicationId !== requestedSubjectMedicationId) {
      throw new ConflictException(
        'Request ID cannot be reused for a different medication',
      );
    }
  }

  private assertReusableSessionMedication(
    sessionSubjectMedicationId: number | null,
    requestedSubjectMedicationId: number | undefined,
  ): void {
    const requestedSubjectMedication = requestedSubjectMedicationId ?? null;

    if (requestedSubjectMedication !== sessionSubjectMedicationId) {
      throw new ConflictException(
        'Chat session cannot be reused for a different medication',
      );
    }
  }

  private async markFailedSafely(userMessageId: number): Promise<void> {
    try {
      await this.chatRepository.markRequestFailed(userMessageId);
    } catch (error) {
      this.logger.error(
        `Failed to mark chat request ${userMessageId} as failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
