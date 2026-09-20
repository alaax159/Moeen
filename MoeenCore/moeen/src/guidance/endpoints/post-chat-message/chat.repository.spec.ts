import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { chatMessage, chatSession } from '../../../database/schema';
import { ChatRepository } from './chat.repository';

describe('ChatRepository', () => {
  it('creates the session and initial processing user turn in one transaction', async () => {
    const sessionReturning = jest.fn().mockResolvedValue([{ id: 41 }]);

    const sessionValues = jest.fn().mockReturnValue({
      returning: sessionReturning,
    });

    const messageReturning = jest.fn().mockResolvedValue([{ id: 91 }]);

    const onConflictDoNothing = jest.fn().mockReturnValue({
      returning: messageReturning,
    });

    const messageValues = jest.fn().mockReturnValue({
      onConflictDoNothing,
    });

    const insert = jest.fn((table: unknown) => {
      if (table === chatSession) {
        return { values: sessionValues };
      }

      if (table === chatMessage) {
        return { values: messageValues };
      }

      throw new Error('Unexpected table');
    });

    const tx = { insert };

    const transaction = jest.fn((callback: (value: typeof tx) => unknown) =>
      callback(tx),
    );

    const repository = new ChatRepository({
      transaction,
    } as never);

    const result = await repository.createSessionWithInitialMessage(
      7,
      12,
      '11111111-1111-4111-8111-111111111111',
      'Question',
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(chatSession);
    expect(sessionValues).toHaveBeenCalledWith({
      userId: 7,
      subjectMedicationId: 12,
    });
    expect(insert).toHaveBeenCalledWith(chatMessage);

    expect(messageValues).toHaveBeenCalledWith(
      expect.objectContaining({
        chatSessionId: 41,
        role: 'user',
        content: 'Question',
        requestStatus: 'processing',
      }),
    );

    expect(result).toEqual({
      sessionId: 41,
      userMessageId: 91,
    });
  });

  it('claims a failed request with one conditional update', async () => {
    const returning = jest.fn().mockResolvedValue([{ id: 91 }]);

    const where = jest.fn().mockReturnValue({ returning });

    const set = jest.fn().mockReturnValue({ where });

    const update = jest.fn().mockReturnValue({ set });

    const repository = new ChatRepository({
      update,
    } as never);

    await expect(repository.claimFailedRequest(91)).resolves.toBe(true);

    expect(update).toHaveBeenCalledWith(chatMessage);
    expect(set).toHaveBeenCalledWith({
      requestStatus: 'processing',
    });
  });

  it('persists the assistant and completed state in one transaction', async () => {
    const assistantReturning = jest.fn().mockResolvedValue([{ id: 100 }]);

    const onConflictDoNothing = jest.fn().mockReturnValue({
      returning: assistantReturning,
    });

    const values = jest.fn().mockReturnValue({
      onConflictDoNothing,
    });

    const insert = jest.fn().mockReturnValue({ values });

    const completedReturning = jest.fn().mockResolvedValue([{ id: 91 }]);

    const where = jest.fn().mockReturnValue({
      returning: completedReturning,
    });

    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });

    const tx = {
      insert,
      update,
    };

    const transaction = jest.fn((callback: (value: typeof tx) => unknown) =>
      callback(tx),
    );

    const repository = new ChatRepository({
      transaction,
    } as never);

    const result = await repository.completeRequest(
      91,
      41,
      '11111111-1111-4111-8111-111111111111',
      {
        text: 'Answer',
        citationIds: ['citation-1'],
        validationStatus: 'accepted',
        promptVersion: 'v1',
      },
    );

    expect(result).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(1);

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        chatSessionId: 41,
        role: 'assistant',
        content: 'Answer',
      }),
    );

    expect(set).toHaveBeenCalledWith({
      requestStatus: 'completed',
    });
  });

  it('loads an owned session subject medication scoped by session and user', async () => {
    let capturedWhere: SQL | undefined;

    const limit = jest.fn().mockResolvedValue([
      {
        subjectMedicationId: 12,
      },
    ]);

    const where = jest.fn((condition: SQL) => {
      capturedWhere = condition;
      return { limit };
    });

    const from = jest.fn().mockReturnValue({ where });
    const select = jest.fn().mockReturnValue({ from });

    const repository = new ChatRepository({
      select,
    } as never);

    const result = await repository.findSessionForUser(55, 7);

    expect(select).toHaveBeenCalledWith({
      subjectMedicationId: chatSession.subjectMedicationId,
    });

    expect(from).toHaveBeenCalledWith(chatSession);
    expect(where).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith(1);
    expect(capturedWhere).toBeDefined();

    const compiledWhere = new PgDialect().sqlToQuery(capturedWhere as SQL);

    expect(compiledWhere.params).toEqual([55, 7]);
    expect(compiledWhere.sql).toContain('user_id');

    expect(result).toEqual({
      subjectMedicationId: 12,
    });
  });

  it('loads only completed history for the requested session in chronological order', async () => {
    let capturedWhere: SQL | undefined;

    const limit = jest.fn().mockResolvedValue([
      {
        requestId: 'request-2',
        role: 'assistant',
        content: 'Second answer',
      },
      {
        requestId: 'request-2',
        role: 'user',
        content: 'Second question',
      },
      {
        requestId: 'request-1',
        role: 'assistant',
        content: 'First answer',
      },
      {
        requestId: 'request-1',
        role: 'user',
        content: 'First question',
      },
    ]);

    const orderBy = jest.fn().mockReturnValue({ limit });

    const where = jest.fn((condition: SQL) => {
      capturedWhere = condition;
      return { orderBy };
    });

    const from = jest.fn().mockReturnValue({ where });
    const select = jest.fn().mockReturnValue({ from });

    const repository = new ChatRepository({
      select,
    } as never);

    const result = await repository.loadCompletedHistory(41);

    expect(select).toHaveBeenCalledWith({
      requestId: chatMessage.requestId,
      role: chatMessage.role,
      content: chatMessage.content,
    });

    expect(from).toHaveBeenCalledWith(chatMessage);
    expect(where).toHaveBeenCalledTimes(1);
    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith(100);

    expect(capturedWhere).toBeDefined();

    const compiledWhere = new PgDialect().sqlToQuery(capturedWhere as SQL);

    expect(compiledWhere.params).toEqual([
      41,
      'user',
      'completed',
      'assistant',
    ]);

    expect(compiledWhere.sql).toContain('chat_session_id');
    expect(compiledWhere.sql).toContain('request_id');
    expect(compiledWhere.sql).toContain('request_status');

    expect(result).toEqual([
      {
        requestId: 'request-1',
        role: 'user',
        content: 'First question',
      },
      {
        requestId: 'request-1',
        role: 'assistant',
        content: 'First answer',
      },
      {
        requestId: 'request-2',
        role: 'user',
        content: 'Second question',
      },
      {
        requestId: 'request-2',
        role: 'assistant',
        content: 'Second answer',
      },
    ]);
  });
});
