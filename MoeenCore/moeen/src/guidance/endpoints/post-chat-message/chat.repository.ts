import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, or } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../../../database/database.constants';
import * as schema from '../../../database/schema';
import { chatMessage, chatSession } from '../../../database/schema';
import type { GuidanceResponse } from '../../contracts';

export class DuplicateChatRequestError extends Error {
  constructor() {
    super('Duplicate chat request');
    this.name = DuplicateChatRequestError.name;
  }
}

export type ChatRequestStatus = 'processing' | 'completed' | 'failed';

export interface StoredChatRequest {
  userMessageId: number;
  sessionId: number;
  subjectMedicationId: number | null;
  userContent: string;
  status: ChatRequestStatus | null;
  response?: GuidanceResponse;
}

export interface StoredChatSession {
  subjectMedicationId: number | null;
}

export interface ClaimedChatRequest {
  userMessageId: number;
  sessionId: number;
}

export interface ChatHistoryMessage {
  requestId: string;
  role: 'user' | 'assistant';
  content: string;
}

const CHAT_HISTORY_ROW_LIMIT = 100;

@Injectable()
export class ChatRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findRequest(
    userId: number,
    requestId: string,
  ): Promise<StoredChatRequest | null> {
    const [userTurn] = await this.db
      .select({
        userMessageId: chatMessage.id,
        sessionId: chatMessage.chatSessionId,
        subjectMedicationId: chatSession.subjectMedicationId,
        content: chatMessage.content,
        status: chatMessage.requestStatus,
      })
      .from(chatMessage)
      .innerJoin(chatSession, eq(chatMessage.chatSessionId, chatSession.id))
      .where(
        and(
          eq(chatSession.userId, userId),
          eq(chatMessage.requestId, requestId),
          eq(chatMessage.role, 'user'),
        ),
      )
      .limit(1);

    if (!userTurn) {
      return null;
    }

    const [assistantTurn] = await this.db
      .select({
        content: chatMessage.content,
        citations: chatMessage.citations,
        validationStatus: chatMessage.validationStatus,
        promptVersion: chatMessage.promptVersion,
      })
      .from(chatMessage)
      .where(
        and(
          eq(chatMessage.chatSessionId, userTurn.sessionId),
          eq(chatMessage.requestId, requestId),
          eq(chatMessage.role, 'assistant'),
        ),
      )
      .limit(1);

    const response =
      assistantTurn?.validationStatus && assistantTurn.promptVersion
        ? {
            text: assistantTurn.content,
            citationIds: assistantTurn.citations,
            validationStatus: assistantTurn.validationStatus,
            promptVersion: assistantTurn.promptVersion,
          }
        : undefined;

    return {
      userMessageId: userTurn.userMessageId,
      sessionId: userTurn.sessionId,
      subjectMedicationId: userTurn.subjectMedicationId,
      userContent: userTurn.content,
      status: userTurn.status,
      response,
    };
  }

  async createSessionWithInitialMessage(
    userId: number,
    subjectMedicationId: number | undefined,
    requestId: string,
    content: string,
  ): Promise<ClaimedChatRequest> {
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .insert(chatSession)
        .values({
          userId,
          subjectMedicationId: subjectMedicationId ?? null,
        })
        .returning({ id: chatSession.id });

      const [userMessage] = await tx
        .insert(chatMessage)
        .values({
          chatSessionId: session.id,
          role: 'user',
          content,
          requestId,
          requestStatus: 'processing',
          citations: [],
          validationStatus: null,
          promptVersion: null,
        })
        .onConflictDoNothing()
        .returning({ id: chatMessage.id });

      if (!userMessage) {
        throw new DuplicateChatRequestError();
      }

      return {
        sessionId: session.id,
        userMessageId: userMessage.id,
      };
    });
  }

  async findSessionForUser(
    sessionId: number,
    userId: number,
  ): Promise<StoredChatSession | null> {
    const [session] = await this.db
      .select({
        subjectMedicationId: chatSession.subjectMedicationId,
      })
      .from(chatSession)
      .where(and(eq(chatSession.id, sessionId), eq(chatSession.userId, userId)))
      .limit(1);

    return session ?? null;
  }

  async insertUserMessage(
    sessionId: number,
    requestId: string,
    content: string,
  ): Promise<ClaimedChatRequest | null> {
    const [userMessage] = await this.db
      .insert(chatMessage)
      .values({
        chatSessionId: sessionId,
        role: 'user',
        content,
        requestId,
        requestStatus: 'processing',
        citations: [],
        validationStatus: null,
        promptVersion: null,
      })
      .onConflictDoNothing()
      .returning({ id: chatMessage.id });

    if (!userMessage) {
      return null;
    }

    return {
      sessionId,
      userMessageId: userMessage.id,
    };
  }

  async claimFailedRequest(userMessageId: number): Promise<boolean> {
    const [claimed] = await this.db
      .update(chatMessage)
      .set({ requestStatus: 'processing' })
      .where(
        and(
          eq(chatMessage.id, userMessageId),
          eq(chatMessage.role, 'user'),
          eq(chatMessage.requestStatus, 'failed'),
        ),
      )
      .returning({ id: chatMessage.id });

    return Boolean(claimed);
  }

  async markRequestFailed(userMessageId: number): Promise<boolean> {
    const [failed] = await this.db
      .update(chatMessage)
      .set({ requestStatus: 'failed' })
      .where(
        and(
          eq(chatMessage.id, userMessageId),
          eq(chatMessage.role, 'user'),
          eq(chatMessage.requestStatus, 'processing'),
        ),
      )
      .returning({ id: chatMessage.id });

    return Boolean(failed);
  }

  async loadCompletedHistory(sessionId: number): Promise<ChatHistoryMessage[]> {
    const rows = await this.db
      .select({
        requestId: chatMessage.requestId,
        role: chatMessage.role,
        content: chatMessage.content,
      })
      .from(chatMessage)
      .where(
        and(
          eq(chatMessage.chatSessionId, sessionId),
          isNotNull(chatMessage.requestId),
          or(
            and(
              eq(chatMessage.role, 'user'),
              eq(chatMessage.requestStatus, 'completed'),
            ),
            eq(chatMessage.role, 'assistant'),
          ),
        ),
      )
      .orderBy(desc(chatMessage.createdAt), desc(chatMessage.id))
      .limit(CHAT_HISTORY_ROW_LIMIT);

    return [...rows].reverse().flatMap((row) =>
      row.requestId === null
        ? []
        : [
            {
              requestId: row.requestId,
              role: row.role,
              content: row.content,
            },
          ],
    );
  }

  async completeRequest(
    userMessageId: number,
    sessionId: number,
    requestId: string,
    response: GuidanceResponse,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [assistantMessage] = await tx
        .insert(chatMessage)
        .values({
          chatSessionId: sessionId,
          role: 'assistant',
          content: response.text,
          requestId,
          requestStatus: null,
          citations: response.citationIds,
          validationStatus: response.validationStatus,
          promptVersion: response.promptVersion,
        })
        .onConflictDoNothing()
        .returning({ id: chatMessage.id });

      if (!assistantMessage) {
        return false;
      }

      const [completed] = await tx
        .update(chatMessage)
        .set({ requestStatus: 'completed' })
        .where(
          and(
            eq(chatMessage.id, userMessageId),
            eq(chatMessage.role, 'user'),
            eq(chatMessage.requestStatus, 'processing'),
          ),
        )
        .returning({ id: chatMessage.id });

      if (!completed) {
        throw new Error('Chat request could not transition to completed');
      }

      return true;
    });
  }
}
