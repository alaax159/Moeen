import { Job, Queue } from 'bullmq';

import {
  FETCH_LABEL_JOB,
  FetchLabelJobData,
  PROCESS_LABEL_JOB,
  ProcessLabelJobData,
  processLabelJobId,
} from './label-ingestion-queue.constants';
import { DailyMedClient } from './dailymed-client';
import { LabelDocumentRepository } from './label-document.repository';
import { LabelIngestionProcessor } from './label-ingestion.processor';
import { LabelProcessingService } from '../label-processing/label-processing.service';
import { DETERMINISTIC_EMBEDDING_PROFILE } from '../label-processing/embedding-provider';

describe('LabelIngestionProcessor', () => {
  let processor: LabelIngestionProcessor;
  let dailyMedClient: { fetchMetadata: jest.Mock; fetchRawContent: jest.Mock };
  let labelDocumentRepository: {
    recordFetched: jest.Mock;
    recordFailed: jest.Mock;
    findRawContent: jest.Mock;
  };
  let labelProcessingService: {
    processLabel: jest.Mock;
    getEmbeddingProfile: jest.Mock;
  };
  let queue: { add: jest.Mock };

  beforeEach(() => {
    dailyMedClient = { fetchMetadata: jest.fn(), fetchRawContent: jest.fn() };
    labelDocumentRepository = {
      recordFetched: jest
        .fn()
        .mockResolvedValue({ contentChanged: true, invalidatedUserIds: [] }),
      recordFailed: jest.fn(),
      findRawContent: jest.fn(),
    };
    labelProcessingService = {
      processLabel: jest.fn(),
      getEmbeddingProfile: jest
        .fn()
        .mockReturnValue(DETERMINISTIC_EMBEDDING_PROFILE),
    };
    queue = { add: jest.fn().mockResolvedValue(undefined) };

    processor = new LabelIngestionProcessor(
      dailyMedClient as unknown as DailyMedClient,
      labelDocumentRepository as unknown as LabelDocumentRepository,
      labelProcessingService as unknown as LabelProcessingService,
      queue as unknown as Queue,
    );
  });

  function createFetchJob(attemptsMade = 0): Job<FetchLabelJobData> {
    return {
      name: FETCH_LABEL_JOB,
      data: { medicationId: 7, dailyMedSetId: 'setid-1' },
      attemptsMade,
    } as Job<FetchLabelJobData>;
  }

  function createProcessJob(): Job<ProcessLabelJobData> {
    return {
      name: PROCESS_LABEL_JOB,
      data: {
        medicationId: 7,
        setId: 'setid-1',
        labelVersion: '13',
        embeddingProfile: DETERMINISTIC_EMBEDDING_PROFILE,
      },
      attemptsMade: 0,
    } as Job<ProcessLabelJobData>;
  }

  describe('fetch-label', () => {
    it('fetches metadata then content, records the label as fetched, and enqueues process-label', async () => {
      dailyMedClient.fetchMetadata.mockResolvedValue({ labelVersion: '13' });
      dailyMedClient.fetchRawContent.mockResolvedValue('<document/>');

      await processor.process(createFetchJob());

      expect(dailyMedClient.fetchMetadata).toHaveBeenCalledWith('setid-1');
      expect(dailyMedClient.fetchRawContent).toHaveBeenCalledWith('setid-1');
      expect(labelDocumentRepository.recordFetched).toHaveBeenCalledWith({
        medicationId: 7,
        setId: 'setid-1',
        labelVersion: '13',
        rawContent: '<document/>',
      });
      expect(labelDocumentRepository.recordFailed).not.toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith(
        PROCESS_LABEL_JOB,
        {
          medicationId: 7,
          setId: 'setid-1',
          labelVersion: '13',
          embeddingProfile: DETERMINISTIC_EMBEDDING_PROFILE,
        },
        {
          jobId: processLabelJobId(
            'setid-1',
            '13',
            DETERMINISTIC_EMBEDDING_PROFILE,
          ),
        },
      );
    });

    it('records a failure with labelVersion "unknown" when metadata fetch fails, then rethrows so BullMQ retries', async () => {
      const error = new Error('DailyMed is down');
      dailyMedClient.fetchMetadata.mockRejectedValue(error);

      await expect(processor.process(createFetchJob(2))).rejects.toBe(error);

      expect(dailyMedClient.fetchRawContent).not.toHaveBeenCalled();
      expect(labelDocumentRepository.recordFailed).toHaveBeenCalledWith({
        medicationId: 7,
        setId: 'setid-1',
        labelVersion: 'unknown',
        failureReason: 'DailyMed is down',
        retryCount: 2,
      });
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('records a failure with the real labelVersion when content fetch fails after metadata succeeded, then rethrows', async () => {
      dailyMedClient.fetchMetadata.mockResolvedValue({ labelVersion: '13' });
      const error = new Error('404');
      dailyMedClient.fetchRawContent.mockRejectedValue(error);

      await expect(processor.process(createFetchJob(1))).rejects.toBe(error);

      expect(labelDocumentRepository.recordFailed).toHaveBeenCalledWith({
        medicationId: 7,
        setId: 'setid-1',
        labelVersion: '13',
        failureReason: '404',
        retryCount: 1,
      });
      expect(labelDocumentRepository.recordFetched).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('process-label', () => {
    it('reads rawContent by (setId, labelVersion) and hands it to LabelProcessingService', async () => {
      labelDocumentRepository.findRawContent.mockResolvedValue('<document/>');

      await processor.process(createProcessJob());

      expect(labelDocumentRepository.findRawContent).toHaveBeenCalledWith(
        'setid-1',
        '13',
      );
      expect(labelProcessingService.processLabel).toHaveBeenCalledWith({
        medicationId: 7,
        setId: 'setid-1',
        labelVersion: '13',
        rawContent: '<document/>',
      });
    });

    it('throws (so BullMQ retries) when no rawContent is found for that setid/version', async () => {
      labelDocumentRepository.findRawContent.mockResolvedValue(null);

      await expect(processor.process(createProcessJob())).rejects.toThrow(
        /No rawContent found/,
      );
      expect(labelProcessingService.processLabel).not.toHaveBeenCalled();
    });

    it('rejects a job for a different embedding profile before reading or writing', async () => {
      const job = createProcessJob();
      job.data.embeddingProfile = {
        ...DETERMINISTIC_EMBEDDING_PROFILE,
        version: 'v2',
      };

      await expect(processor.process(job)).rejects.toThrow(/requires .*v2/i);

      expect(labelDocumentRepository.findRawContent).not.toHaveBeenCalled();
      expect(labelProcessingService.processLabel).not.toHaveBeenCalled();
    });
  });
});
