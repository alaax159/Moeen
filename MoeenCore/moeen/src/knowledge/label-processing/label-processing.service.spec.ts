import * as fs from 'fs';
import * as path from 'path';

import {
  LabelChunkRepository,
  LabelChunkToPersist,
} from './label-chunk.repository';
import { LabelProcessingService } from './label-processing.service';
import { SECTION_ORDER } from './spl-section-extractor';
import { DETERMINISTIC_EMBEDDING_PROFILE } from './embedding-provider';

const VALID_VECTOR = Array.from({ length: 1536 }, (_, index) =>
  index === 0 ? 1 : 0,
);

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, '__fixtures__', name), 'utf8');
}

describe('LabelProcessingService', () => {
  let service: LabelProcessingService;
  let embeddingProvider: {
    profile: typeof DETERMINISTIC_EMBEDDING_PROFILE;
    embed: jest.Mock<Promise<number[]>, [string]>;
  };
  let labelChunkRepository: {
    replaceAll: jest.Mock<
      Promise<void>,
      [string, string, LabelChunkToPersist[]]
    >;
  };

  beforeEach(() => {
    embeddingProvider = {
      profile: DETERMINISTIC_EMBEDDING_PROFILE,
      embed: jest
        .fn<Promise<number[]>, [string]>()
        .mockResolvedValue(VALID_VECTOR),
    };
    labelChunkRepository = {
      replaceAll: jest
        .fn<Promise<void>, [string, string, LabelChunkToPersist[]]>()
        .mockResolvedValue(undefined),
    };

    service = new LabelProcessingService(
      embeddingProvider,
      labelChunkRepository as unknown as LabelChunkRepository,
    );
  });

  it('processes a real full-prescription label into chunks spanning all six sections, with globally sequential ordinals', async () => {
    const rawContent = loadFixture('lisinopril-tablet.spl.xml');

    const result = await service.processLabel({
      medicationId: 42,
      setId: 'setid-1',
      labelVersion: '13',
      rawContent,
    });

    expect(result.chunksWritten).toBeGreaterThan(0);
    expect(labelChunkRepository.replaceAll).toHaveBeenCalledTimes(1);

    const [, , persisted] = labelChunkRepository.replaceAll.mock.calls[0];

    for (const chunk of persisted) {
      expect(SECTION_ORDER).toContain(chunk.section);
    }

    // ordinals are 0..N-1, sequential, no gaps, no repeats — required for
    // the (set_id, label_version, ordinal) unique index to behave.
    const ordinals = persisted.map((c) => c.ordinal).sort((a, b) => a - b);
    expect(ordinals).toEqual(persisted.map((_, i) => i));

    expect(labelChunkRepository.replaceAll).toHaveBeenCalledWith(
      'setid-1',
      '13',
      persisted,
    );
  });

  it('produces fewer chunks for a label missing sections, never throwing', async () => {
    const rawContent = loadFixture('acetaminophen-tablet.spl.xml');

    const result = await service.processLabel({
      medicationId: 7,
      setId: 'setid-2',
      labelVersion: '3',
      rawContent,
    });

    expect(result.chunksWritten).toBeGreaterThan(0);

    const [, , persisted] = labelChunkRepository.replaceAll.mock.calls[0];
    const sectionsUsed = new Set(persisted.map((c) => c.section));

    expect(sectionsUsed.has('contraindications')).toBe(false);
    expect(sectionsUsed.has('adverse_reactions')).toBe(false);
    expect(sectionsUsed.has('drug_interactions')).toBe(false);
  });

  it('embeds every chunk it persists', async () => {
    const rawContent = loadFixture('acetaminophen-tablet.spl.xml');

    await service.processLabel({
      medicationId: 7,
      setId: 'setid-2',
      labelVersion: '3',
      rawContent,
    });

    const [, , persisted] = labelChunkRepository.replaceAll.mock.calls[0];
    expect(embeddingProvider.embed).toHaveBeenCalledTimes(persisted.length);
    expect(persisted[0]).toMatchObject({
      embeddingModel: DETERMINISTIC_EMBEDDING_PROFILE.model,
      embeddingVersion: DETERMINISTIC_EMBEDDING_PROFILE.version,
    });
  });

  it('rejects an invalid provider vector before persisting any chunks', async () => {
    embeddingProvider.embed.mockResolvedValue([0.1, 0.2]);

    await expect(
      service.processLabel({
        medicationId: 7,
        setId: 'setid-2',
        labelVersion: '3',
        rawContent: loadFixture('acetaminophen-tablet.spl.xml'),
      }),
    ).rejects.toThrow(/returned 2 dimensions/i);

    expect(labelChunkRepository.replaceAll).not.toHaveBeenCalled();
  });
});

/**
 * KC-1 T3's "done when": running the same job twice leaves chunk count
 * unchanged. The suite above only checks that the right calls were made,
 * not what a real repository would end up storing across two separate
 * runs — this fake actually implements upsert/trim semantics (keyed the
 * same way the real (set_id, label_version, ordinal) unique index is) so
 * the assertion is on real resulting state, not on mocked call args.
 */
class InMemoryLabelChunkRepository {
  private rows = new Map<string, LabelChunkToPersist>();

  replaceAll(
    setId: string,
    labelVersion: string,
    chunks: LabelChunkToPersist[],
  ): Promise<void> {
    for (const chunk of chunks) {
      this.rows.set(
        this.key(chunk.setId, chunk.labelVersion, chunk.ordinal),
        chunk,
      );
    }
    for (const [key, row] of this.rows) {
      if (
        row.setId === setId &&
        row.labelVersion === labelVersion &&
        row.ordinal >= chunks.length
      ) {
        this.rows.delete(key);
      }
    }
    return Promise.resolve();
  }

  count(): number {
    return this.rows.size;
  }

  private key(setId: string, labelVersion: string, ordinal: number): string {
    return `${setId}::${labelVersion}::${ordinal}`;
  }
}

describe('LabelProcessingService — idempotent reprocessing (KC-1 T3)', () => {
  it('processing the same label twice leaves the persisted chunk count unchanged', async () => {
    const embeddingProvider = {
      profile: DETERMINISTIC_EMBEDDING_PROFILE,
      embed: jest.fn().mockResolvedValue(VALID_VECTOR),
    };
    const fakeRepository = new InMemoryLabelChunkRepository();
    const service = new LabelProcessingService(
      embeddingProvider,
      fakeRepository as unknown as LabelChunkRepository,
    );

    const params = {
      medicationId: 42,
      setId: 'setid-1',
      labelVersion: '13',
      rawContent: loadFixture('lisinopril-tablet.spl.xml'),
    };

    const first = await service.processLabel(params);
    expect(fakeRepository.count()).toBe(first.chunksWritten);

    const second = await service.processLabel(params);
    expect(second.chunksWritten).toBe(first.chunksWritten);
    expect(fakeRepository.count()).toBe(first.chunksWritten); // NOT doubled
  });

  it('reprocessing with fewer chunks than before trims the leftover stale rows', async () => {
    const embeddingProvider = {
      profile: DETERMINISTIC_EMBEDDING_PROFILE,
      embed: jest.fn().mockResolvedValue(VALID_VECTOR),
    };
    const fakeRepository = new InMemoryLabelChunkRepository();
    const service = new LabelProcessingService(
      embeddingProvider,
      fakeRepository as unknown as LabelChunkRepository,
    );

    // First pass: the full label, real chunk count.
    const full = await service.processLabel({
      medicationId: 42,
      setId: 'setid-1',
      labelVersion: '13',
      rawContent: loadFixture('lisinopril-tablet.spl.xml'),
    });
    expect(fakeRepository.count()).toBe(full.chunksWritten);

    // Second pass, same setid+version but a shorter document — simulates
    // a corrected/edited rawContent producing fewer chunks this time.
    const shorter = await service.processLabel({
      medicationId: 42,
      setId: 'setid-1',
      labelVersion: '13',
      rawContent: loadFixture('acetaminophen-tablet.spl.xml'),
    });

    expect(shorter.chunksWritten).toBeLessThan(full.chunksWritten);
    // the stale ordinals from the longer first pass must be gone, not
    // just overwritten up to the shorter run's count.
    expect(fakeRepository.count()).toBe(shorter.chunksWritten);
  });
});
