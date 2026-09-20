import { Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  FETCH_LABEL_JOB,
  FetchLabelJobData,
  LabelIngestionJobData,
  PROCESS_LABEL_JOB,
  processLabelJobId,
} from './label-ingestion-queue.constants';
import { LabelDocumentRepository } from './label-document.repository';
import { LabelIngestionReconciler } from './label-ingestion.reconciler';
import { LabelProcessingService } from '../label-processing/label-processing.service';
import { DETERMINISTIC_EMBEDDING_PROFILE } from '../label-processing/embedding-provider';

describe('LabelIngestionReconciler', () => {
  let reconciler: LabelIngestionReconciler;
  let labelDocumentRepository: {
    findMedicationsNeedingIngestion: jest.Mock;
    findDocumentsNeedingEmbedding: jest.Mock;
  };
  let labelProcessingService: { getEmbeddingProfile: jest.Mock };
  let queue: { add: jest.Mock };

  beforeEach(() => {
    labelDocumentRepository = {
      findMedicationsNeedingIngestion: jest.fn(),
      findDocumentsNeedingEmbedding: jest.fn().mockResolvedValue([]),
    };
    labelProcessingService = {
      getEmbeddingProfile: jest
        .fn()
        .mockReturnValue(DETERMINISTIC_EMBEDDING_PROFILE),
    };
    queue = { add: jest.fn().mockResolvedValue(undefined) };

    reconciler = new LabelIngestionReconciler(
      labelDocumentRepository as unknown as LabelDocumentRepository,
      labelProcessingService as unknown as LabelProcessingService,
      queue as unknown as Queue<LabelIngestionJobData>,
    );
  });

  it('enqueues a fetch job, with the dm/ prefix stripped, for every medication missing a label_document row', async () => {
    labelDocumentRepository.findMedicationsNeedingIngestion.mockResolvedValue([
      { medicationId: 1, dailyMedId: 'dm/setid-a' },
      { medicationId: 2, dailyMedId: 'dm/setid-b' },
    ]);

    await reconciler.onApplicationBootstrap();

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      FETCH_LABEL_JOB,
      { medicationId: 1, dailyMedSetId: 'setid-a' },
      { jobId: `${FETCH_LABEL_JOB}-setid-a` },
    );
    expect(queue.add).toHaveBeenCalledWith(
      FETCH_LABEL_JOB,
      { medicationId: 2, dailyMedSetId: 'setid-b' },
      { jobId: `${FETCH_LABEL_JOB}-setid-b` },
    );
  });

  it('enqueues nothing when every medication already has a label_document row', async () => {
    labelDocumentRepository.findMedicationsNeedingIngestion.mockResolvedValue(
      [],
    );

    await reconciler.onApplicationBootstrap();

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues profile-specific processing for fetched labels with stale embeddings', async () => {
    labelDocumentRepository.findMedicationsNeedingIngestion.mockResolvedValue(
      [],
    );
    labelDocumentRepository.findDocumentsNeedingEmbedding.mockResolvedValue([
      { medicationId: 7, setId: 'setid-a', labelVersion: '13' },
    ]);

    await reconciler.onApplicationBootstrap();

    expect(
      labelDocumentRepository.findDocumentsNeedingEmbedding,
    ).toHaveBeenCalledWith('deterministic-sha256', 'v1');
    expect(queue.add).toHaveBeenCalledWith(
      PROCESS_LABEL_JOB,
      {
        medicationId: 7,
        setId: 'setid-a',
        labelVersion: '13',
        embeddingProfile: DETERMINISTIC_EMBEDDING_PROFILE,
      },
      {
        jobId: processLabelJobId(
          'setid-a',
          '13',
          DETERMINISTIC_EMBEDDING_PROFILE,
        ),
      },
    );
  });

  it('reuses the same deterministic jobId the listener uses, so an in-flight fetch is not duplicated', async () => {
    labelDocumentRepository.findMedicationsNeedingIngestion.mockResolvedValue([
      { medicationId: 1, dailyMedId: 'dm/setid-a' },
    ]);

    await reconciler.onApplicationBootstrap();

    const [, , options] = queue.add.mock.calls[0] as [
      string,
      FetchLabelJobData,
      { jobId: string },
    ];
    expect(options.jobId).toBe(`${FETCH_LABEL_JOB}-setid-a`);
  });

  it('does not throw when one enqueue fails, and still enqueues the others', async () => {
    labelDocumentRepository.findMedicationsNeedingIngestion.mockResolvedValue([
      { medicationId: 1, dailyMedId: 'dm/setid-a' },
      { medicationId: 2, dailyMedId: 'dm/setid-b' },
      { medicationId: 3, dailyMedId: 'dm/setid-c' },
    ]);
    queue.add.mockImplementation((_name: string, data: FetchLabelJobData) =>
      data.dailyMedSetId === 'setid-b'
        ? Promise.reject(new Error('Redis unavailable'))
        : Promise.resolve(undefined),
    );
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(reconciler.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(queue.add).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Redis unavailable'),
    );

    errorSpy.mockRestore();
  });

  it('logs and does not abort application startup when reconciliation queries fail', async () => {
    labelDocumentRepository.findMedicationsNeedingIngestion.mockRejectedValue(
      new Error('Postgres unavailable'),
    );
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(reconciler.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Postgres unavailable'),
    );
    expect(queue.add).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
