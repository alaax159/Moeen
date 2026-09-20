import { ConflictException, NotFoundException } from '@nestjs/common';

import { UserMedicationRepository } from '../../../database/repository/user-medication.repository';
import type { GuidanceResponse } from '../../contracts';
import { PipelineOrchestrator } from '../../orchestrator/pipeline-orchestrator.service';
import { ChatHistoryService } from './chat-history.service';
import { ChatIntentClassifier } from './chat-intent-classifier.service';
import { ChatRepository } from './chat.repository';
import { PostChatMessageService } from './post-chat-message.service';

describe('PostChatMessageService', () => {
  let service: PostChatMessageService;

  const chatRepository = {
    findRequest: jest.fn(),
    createSessionWithInitialMessage: jest.fn(),
    findSessionForUser: jest.fn(),
    insertUserMessage: jest.fn(),
    claimFailedRequest: jest.fn(),
    markRequestFailed: jest.fn(),
    completeRequest: jest.fn(),
  };

  const orchestrator = {
    run: jest.fn(),
  };

  const intentClassifier = {
    classify: jest.fn(),
  };

  const chatHistoryService = {
    buildQuestion: jest.fn(),
  };

  const userMedicationRepository = {
    isActiveMedicationForUser: jest.fn(),
  };

  const requestId = '11111111-1111-4111-8111-111111111111';

  const generatedResponse: GuidanceResponse = {
    text: 'This medicine is used for the documented indication.',
    citationIds: ['label:123:warnings:0'],
    validationStatus: 'accepted',
    promptVersion: 'medication_question:v1',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    chatRepository.findRequest.mockResolvedValue(null);
    chatRepository.markRequestFailed.mockResolvedValue(true);
    chatRepository.completeRequest.mockResolvedValue(true);
    chatRepository.findSessionForUser.mockResolvedValue({
      subjectMedicationId: 12,
    });

    intentClassifier.classify.mockReturnValue({
      kind: 'guidance',
      intent: 'medication_question',
    });

    chatHistoryService.buildQuestion.mockImplementation(
      (_sessionId: number, question: string) => question,
    );

    userMedicationRepository.isActiveMedicationForUser.mockResolvedValue(true);

    service = new PostChatMessageService(
      chatRepository as unknown as ChatRepository,
      orchestrator as unknown as PipelineOrchestrator,
      intentClassifier as unknown as ChatIntentClassifier,
      chatHistoryService as unknown as ChatHistoryService,
      userMedicationRepository as unknown as UserMedicationRepository,
    );
  });

  it('atomically creates the initial session and user turn before generating the response', async () => {
    chatRepository.createSessionWithInitialMessage.mockResolvedValue({
      sessionId: 41,
      userMessageId: 91,
    });

    orchestrator.run.mockResolvedValue(generatedResponse);

    const result = await service.postMessage(7, {
      requestId,
      message: 'What is this medicine for?',
      subjectMedicationId: 12,
    });

    expect(chatRepository.createSessionWithInitialMessage).toHaveBeenCalledWith(
      7,
      12,
      requestId,
      'What is this medicine for?',
    );

    expect(orchestrator.run).toHaveBeenCalledTimes(1);

    expect(chatRepository.completeRequest).toHaveBeenCalledWith(
      91,
      41,
      requestId,
      generatedResponse,
    );

    expect(result).toEqual({
      sessionId: 41,
      response: generatedResponse,
    });
  });

  it('does not start another generation while the same request is already processing', async () => {
    chatRepository.findRequest.mockResolvedValue({
      userMessageId: 91,
      sessionId: 41,
      subjectMedicationId: null,
      userContent: 'Question',
      status: 'processing',
    });

    await expect(
      service.postMessage(7, {
        requestId,
        message: 'Question',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it('returns a completed idempotent request without another orchestrator call', async () => {
    chatRepository.findRequest.mockResolvedValue({
      userMessageId: 91,
      sessionId: 41,
      subjectMedicationId: null,
      userContent: 'Question',
      status: 'completed',
      response: generatedResponse,
    });

    const result = await service.postMessage(7, {
      requestId,
      message: 'Question',
    });

    expect(orchestrator.run).not.toHaveBeenCalled();
    expect(intentClassifier.classify).not.toHaveBeenCalled();

    expect(result).toEqual({
      sessionId: 41,
      response: generatedResponse,
    });
  });

  it('atomically claims a failed request before retrying generation', async () => {
    chatRepository.findRequest.mockResolvedValue({
      userMessageId: 91,
      sessionId: 41,
      subjectMedicationId: 12,
      userContent: 'Question',
      status: 'failed',
    });

    chatRepository.claimFailedRequest.mockResolvedValue(true);

    orchestrator.run.mockResolvedValue(generatedResponse);

    await service.postMessage(7, {
      requestId,
      message: 'Question',
      subjectMedicationId: 12,
    });

    expect(chatRepository.claimFailedRequest).toHaveBeenCalledWith(91);

    expect(orchestrator.run).toHaveBeenCalledTimes(1);
  });

  it('does not generate when another retry wins the failed-request claim', async () => {
    chatRepository.findRequest
      .mockResolvedValueOnce({
        userMessageId: 91,
        sessionId: 41,
        subjectMedicationId: null,
        userContent: 'Question',
        status: 'failed',
      })
      .mockResolvedValueOnce({
        userMessageId: 91,
        sessionId: 41,
        subjectMedicationId: null,
        userContent: 'Question',
        status: 'processing',
      });

    chatRepository.claimFailedRequest.mockResolvedValue(false);

    await expect(
      service.postMessage(7, {
        requestId,
        message: 'Question',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it('marks the request failed when generation throws so it can be retried later', async () => {
    chatRepository.createSessionWithInitialMessage.mockResolvedValue({
      sessionId: 41,
      userMessageId: 91,
    });

    orchestrator.run.mockRejectedValue(new Error('pipeline unavailable'));

    await expect(
      service.postMessage(7, {
        requestId,
        message: 'Question',
        subjectMedicationId: 12,
      }),
    ).rejects.toThrow('pipeline unavailable');

    expect(chatRepository.markRequestFailed).toHaveBeenCalledWith(91);
  });

  it('rejects request-id reuse with different message content', async () => {
    chatRepository.findRequest.mockResolvedValue({
      userMessageId: 91,
      sessionId: 41,
      subjectMedicationId: null,
      userContent: 'Original',
      status: 'failed',
    });

    await expect(
      service.postMessage(7, {
        requestId,
        message: 'Different',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it('does not return a completed idempotent response for a different medication', async () => {
    chatRepository.findRequest.mockResolvedValue({
      userMessageId: 91,
      sessionId: 41,
      subjectMedicationId: 12,
      userContent: 'Question',
      status: 'completed',
      response: generatedResponse,
    });

    await expect(
      service.postMessage(7, {
        requestId,
        message: 'Question',
        subjectMedicationId: 99,
      }),
    ).rejects.toThrow('Request ID cannot be reused for a different medication');

    expect(orchestrator.run).not.toHaveBeenCalled();
    expect(chatRepository.claimFailedRequest).not.toHaveBeenCalled();
  });

  it('does not claim a failed idempotent request for a different medication', async () => {
    chatRepository.findRequest.mockResolvedValue({
      userMessageId: 91,
      sessionId: 41,
      subjectMedicationId: 12,
      userContent: 'Question',
      status: 'failed',
    });

    await expect(
      service.postMessage(7, {
        requestId,
        message: 'Question',
        subjectMedicationId: 99,
      }),
    ).rejects.toThrow('Request ID cannot be reused for a different medication');

    expect(chatRepository.claimFailedRequest).not.toHaveBeenCalled();
    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it('does not reuse an idempotent request through a different session', async () => {
    chatRepository.findRequest.mockResolvedValue({
      userMessageId: 91,
      sessionId: 41,
      subjectMedicationId: 12,
      userContent: 'Question',
      status: 'completed',
      response: generatedResponse,
    });

    await expect(
      service.postMessage(7, {
        requestId,
        message: 'Question',
        sessionId: 55,
        subjectMedicationId: 12,
      }),
    ).rejects.toThrow(
      'Request ID cannot be reused for a different chat session',
    );

    expect(chatRepository.findSessionForUser).not.toHaveBeenCalled();
    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it('reuses an existing session only when it belongs to the authenticated patient', async () => {
    chatRepository.findSessionForUser.mockResolvedValue({
      subjectMedicationId: 12,
    });

    chatRepository.insertUserMessage.mockResolvedValue({
      sessionId: 55,
      userMessageId: 92,
    });

    orchestrator.run.mockResolvedValue(generatedResponse);

    const result = await service.postMessage(7, {
      requestId,
      message: 'Tell me about it.',
      sessionId: 55,
      subjectMedicationId: 12,
    });

    expect(chatRepository.findSessionForUser).toHaveBeenCalledWith(55, 7);

    expect(result.sessionId).toBe(55);
  });

  it('rejects reusing a medication-bound session for a different medication before storing the message', async () => {
    chatRepository.findSessionForUser.mockResolvedValue({
      subjectMedicationId: 12,
    });

    await expect(
      service.postMessage(7, {
        requestId,
        message: 'Tell me about this medicine.',
        sessionId: 55,
        subjectMedicationId: 99,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(chatRepository.insertUserMessage).not.toHaveBeenCalled();
    expect(chatHistoryService.buildQuestion).not.toHaveBeenCalled();
    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it('allows an unbound session to remain in the same unbound scope without using history', async () => {
    chatRepository.findSessionForUser.mockResolvedValue({
      subjectMedicationId: null,
    });

    chatRepository.insertUserMessage.mockResolvedValue({
      sessionId: 55,
      userMessageId: 92,
    });

    const result = await service.postMessage(7, {
      requestId,
      message: 'What is this medicine for?',
      sessionId: 55,
    });

    expect(chatRepository.insertUserMessage).toHaveBeenCalledWith(
      55,
      requestId,
      'What is this medicine for?',
    );
    expect(chatHistoryService.buildQuestion).not.toHaveBeenCalled();
    expect(orchestrator.run).not.toHaveBeenCalled();
    expect(result.response).toEqual(
      expect.objectContaining({
        validationStatus: 'rejected_fallback',
        promptVersion: 'chat-refusal:v1',
      }),
    );
  });

  it('fails closed when attempting to reuse a legacy session without a medication binding', async () => {
    chatRepository.findSessionForUser.mockResolvedValue({
      subjectMedicationId: null,
    });

    await expect(
      service.postMessage(7, {
        requestId,
        message: 'Tell me about this medicine.',
        sessionId: 55,
        subjectMedicationId: 12,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(chatRepository.insertUserMessage).not.toHaveBeenCalled();
    expect(chatHistoryService.buildQuestion).not.toHaveBeenCalled();
    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it('rejects omitting the medication when reusing a medication-bound session', async () => {
    chatRepository.findSessionForUser.mockResolvedValue({
      subjectMedicationId: 12,
    });

    await expect(
      service.postMessage(7, {
        requestId,
        message: 'Tell me about it.',
        sessionId: 55,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(chatRepository.insertUserMessage).not.toHaveBeenCalled();
    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it('does not expose whether another patient owns a requested session', async () => {
    chatRepository.findSessionForUser.mockResolvedValue(null);

    await expect(
      service.postMessage(7, {
        requestId,
        message: 'Hello',
        sessionId: 999,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(chatRepository.insertUserMessage).not.toHaveBeenCalled();

    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it('fails closed without a subject medication and makes zero orchestrator calls', async () => {
    chatRepository.createSessionWithInitialMessage.mockResolvedValue({
      sessionId: 41,
      userMessageId: 91,
    });

    const result = await service.postMessage(7, {
      requestId,
      message: 'What is this medicine for?',
    });

    expect(orchestrator.run).not.toHaveBeenCalled();

    expect(
      userMedicationRepository.isActiveMedicationForUser,
    ).not.toHaveBeenCalled();

    expect(chatHistoryService.buildQuestion).not.toHaveBeenCalled();

    expect(result.response).toEqual(
      expect.objectContaining({
        citationIds: [],
        validationStatus: 'rejected_fallback',
        promptVersion: 'chat-refusal:v1',
      }),
    );
  });

  it('returns the standard diagnosis refusal with zero orchestrator calls', async () => {
    chatRepository.createSessionWithInitialMessage.mockResolvedValue({
      sessionId: 41,
      userMessageId: 91,
    });

    intentClassifier.classify.mockReturnValue({
      kind: 'refusal',
      reason: 'diagnosis',
    });

    const result = await service.postMessage(7, {
      requestId,
      message: 'Do I have diabetes?',
      subjectMedicationId: 12,
    });

    expect(orchestrator.run).not.toHaveBeenCalled();

    expect(
      userMedicationRepository.isActiveMedicationForUser,
    ).not.toHaveBeenCalled();

    expect(chatHistoryService.buildQuestion).not.toHaveBeenCalled();

    expect(result.response).toEqual(
      expect.objectContaining({
        citationIds: [],
        validationStatus: 'rejected_fallback',
        promptVersion: 'chat-refusal:v1',
      }),
    );

    expect(result.response.text).toContain('doctor or pharmacist');
  });

  it('returns the standard dose-change refusal with zero orchestrator calls', async () => {
    chatRepository.createSessionWithInitialMessage.mockResolvedValue({
      sessionId: 41,
      userMessageId: 91,
    });

    intentClassifier.classify.mockReturnValue({
      kind: 'refusal',
      reason: 'dose_change',
    });

    await service.postMessage(7, {
      requestId,
      message: 'Should I double my dose?',
      subjectMedicationId: 12,
    });

    expect(orchestrator.run).not.toHaveBeenCalled();

    expect(
      userMedicationRepository.isActiveMedicationForUser,
    ).not.toHaveBeenCalled();
  });

  it('refuses a subject medication that is not active and ongoing for the patient before the orchestrator', async () => {
    chatRepository.createSessionWithInitialMessage.mockResolvedValue({
      sessionId: 41,
      userMessageId: 91,
    });

    userMedicationRepository.isActiveMedicationForUser.mockResolvedValue(false);

    const result = await service.postMessage(7, {
      requestId,
      message: 'What is this medicine for?',
      subjectMedicationId: 12,
    });

    expect(orchestrator.run).not.toHaveBeenCalled();

    expect(chatHistoryService.buildQuestion).not.toHaveBeenCalled();

    expect(result.response.promptVersion).toBe('chat-refusal:v1');
  });

  it('classifies an explicit missed-dose message into the missed_dose pipeline intent', async () => {
    chatRepository.createSessionWithInitialMessage.mockResolvedValue({
      sessionId: 41,
      userMessageId: 91,
    });

    intentClassifier.classify.mockReturnValue({
      kind: 'guidance',
      intent: 'missed_dose',
    });

    orchestrator.run.mockResolvedValue(generatedResponse);

    await service.postMessage(7, {
      requestId,
      message: 'I missed my dose.',
      subjectMedicationId: 12,
    });

    expect(orchestrator.run).toHaveBeenCalledWith(
      {
        patientId: 7,
        intent: 'missed_dose',
        subjectMedicationId: 12,
      },
      'patient_chat',
    );

    expect(chatHistoryService.buildQuestion).not.toHaveBeenCalled();
  });

  it('sends only the history service output as the medication-question context', async () => {
    chatRepository.createSessionWithInitialMessage.mockResolvedValue({
      sessionId: 41,
      userMessageId: 91,
    });

    chatHistoryService.buildQuestion.mockResolvedValue(
      [
        'Previous conversation:',
        'User: Earlier',
        'Assistant: Earlier answer',
        '',
        'Current question:',
        'Current',
      ].join('\n'),
    );

    orchestrator.run.mockResolvedValue(generatedResponse);

    await service.postMessage(7, {
      requestId,
      message: 'Current',
      subjectMedicationId: 12,
    });

    expect(chatHistoryService.buildQuestion).toHaveBeenCalledWith(
      41,
      'Current',
    );

    expect(orchestrator.run).toHaveBeenCalledWith(
      {
        patientId: 7,
        intent: 'medication_question',
        subjectMedicationId: 12,
        question: [
          'Previous conversation:',
          'User: Earlier',
          'Assistant: Earlier answer',
          '',
          'Current question:',
          'Current',
        ].join('\n'),
      },
      'patient_chat',
    );
  });
});
