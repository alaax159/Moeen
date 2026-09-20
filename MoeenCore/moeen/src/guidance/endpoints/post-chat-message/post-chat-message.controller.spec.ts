import { EventEmitter } from 'node:events';
import type { Response } from 'express';

import type { GuidanceResponse } from '../../contracts';
import { PostChatMessageController } from './post-chat-message.controller';
import { PostChatMessageService } from './post-chat-message.service';

describe('PostChatMessageController', () => {
  const service = {
    postMessage: jest.fn(),
  };

  const requestId = '11111111-1111-4111-8111-111111111111';

  let controller: PostChatMessageController;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new PostChatMessageController(
      service as unknown as PostChatMessageService,
    );
  });

  it('streams the validated response as session, delta and done events', async () => {
    const guidanceResponse: GuidanceResponse = {
      text: 'Hello world',
      citationIds: ['citation-1'],
      validationStatus: 'accepted',
      promptVersion: 'medication_question:v1',
    };

    service.postMessage.mockResolvedValue({
      sessionId: 22,
      response: guidanceResponse,
    });

    const writes: string[] = [];

    const status = jest.fn().mockReturnThis();
    const setHeader = jest.fn();
    const flushHeaders = jest.fn();
    const write = jest.fn((chunk: string) => {
      writes.push(chunk);
      return true;
    });
    const end = jest.fn();

    const response = {
      status,
      setHeader,
      flushHeaders,
      write,
      end,
      destroyed: false,
      writableEnded: false,
    } as unknown as Response;

    await controller.postMessage(
      {
        requestId,
        message: 'What is it for?',
        subjectMedicationId: 5,
      },
      { id: 7 },
      response,
    );

    expect(service.postMessage).toHaveBeenCalledWith(7, {
      requestId,
      message: 'What is it for?',
      subjectMedicationId: 5,
    });

    expect(writes).toEqual([
      'event: session\ndata: {"sessionId":22}\n\n',
      'event: delta\ndata: {"text":"Hello "}\n\n',
      'event: delta\ndata: {"text":"world"}\n\n',
      'event: done\ndata: {"citations":["citation-1"],"validationStatus":"accepted","promptVersion":"medication_question:v1"}\n\n',
    ]);

    expect(end).toHaveBeenCalledTimes(1);
  });

  it.each(['close', 'error'] as const)(
    'stops streaming when the response emits %s while waiting for drain',
    async (eventName) => {
      const guidanceResponse: GuidanceResponse = {
        text: 'Hello world',
        citationIds: [],
        validationStatus: 'accepted',
        promptVersion: 'medication_question:v1',
      };

      service.postMessage.mockResolvedValue({
        sessionId: 22,
        response: guidanceResponse,
      });

      const emitter = new EventEmitter();

      const status = jest.fn().mockReturnThis();
      const setHeader = jest.fn();
      const flushHeaders = jest.fn();
      const write = jest.fn().mockReturnValue(false);
      const end = jest.fn();

      const responseLike = Object.assign(emitter, {
        status,
        setHeader,
        flushHeaders,
        write,
        end,
        destroyed: false,
        writableEnded: false,
      });

      const response = responseLike as unknown as Response;

      const pending = controller.postMessage(
        {
          requestId,
          message: 'Question',
        },
        { id: 7 },
        response,
      );

      await new Promise<void>((resolve) => {
        setImmediate(() => {
          responseLike.destroyed = true;

          if (eventName === 'error') {
            emitter.emit('error', new Error('socket closed'));
          } else {
            emitter.emit('close');
          }

          resolve();
        });
      });

      await pending;

      expect(write).toHaveBeenCalledTimes(1);
      expect(end).not.toHaveBeenCalled();
    },
  );

  it('does not start the stream when the service fails before a validated response exists', async () => {
    service.postMessage.mockRejectedValue(new Error('generation failed'));

    const status = jest.fn().mockReturnThis();
    const setHeader = jest.fn();
    const flushHeaders = jest.fn();
    const write = jest.fn().mockReturnValue(true);
    const end = jest.fn();

    const response = {
      status,
      setHeader,
      flushHeaders,
      write,
      end,
      destroyed: false,
      writableEnded: false,
    } as unknown as Response;

    await expect(
      controller.postMessage(
        {
          requestId,
          message: 'Question',
        },
        { id: 7 },
        response,
      ),
    ).rejects.toThrow('generation failed');

    expect(flushHeaders).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });
});
