import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  assertEmbeddingProfile,
  assertEmbeddingVector,
  EMBEDDING_PROVIDER,
  EmbeddingProfile,
  EmbeddingProvider,
} from './embedding-provider';
import {
  LabelChunkRepository,
  LabelChunkToPersist,
} from './label-chunk.repository';
import { extractSections } from './spl-section-extractor';
import { chunkText, countTokens } from './text-chunker';

export interface ProcessLabelParams {
  medicationId: number;
  setId: string;
  labelVersion: string;
  rawContent: string;
}

export interface ProcessLabelResult {
  chunksWritten: number;
}

/**
 * The KC-1 T2 pipeline: raw SPL XML in, retrievable embedded chunks out.
 * Ordinals are assigned sequentially across all sections in SECTION_ORDER
 * (fixed order) — deterministic given the same raw content, which is what
 * lets replaceAll's (set_id, label_version, ordinal) target overwrite in
 * place on re-processing instead of duplicating.
 */
@Injectable()
export class LabelProcessingService {
  private readonly logger = new Logger(LabelProcessingService.name);

  constructor(
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly labelChunkRepository: LabelChunkRepository,
  ) {}

  getEmbeddingProfile(): EmbeddingProfile {
    assertEmbeddingProfile(this.embeddingProvider.profile);
    return { ...this.embeddingProvider.profile };
  }

  async processLabel(params: ProcessLabelParams): Promise<ProcessLabelResult> {
    const embeddingProfile = this.getEmbeddingProfile();
    const sections = extractSections(params.rawContent);

    const toPersist: LabelChunkToPersist[] = [];
    let ordinal = 0;

    for (const { section, text } of sections) {
      for (const pieceText of chunkText(text)) {
        const embedding = await this.embeddingProvider.embed(pieceText);
        assertEmbeddingVector(embedding, embeddingProfile);

        toPersist.push({
          medicationId: params.medicationId,
          setId: params.setId,
          labelVersion: params.labelVersion,
          section,
          ordinal,
          text: pieceText,
          embedding,
          embeddingModel: embeddingProfile.model,
          embeddingVersion: embeddingProfile.version,
          tokenCount: countTokens(pieceText),
        });

        ordinal += 1;
      }
    }

    await this.labelChunkRepository.replaceAll(
      params.setId,
      params.labelVersion,
      toPersist,
    );

    this.logger.log(
      `Processed label medicationId=${params.medicationId} setid=${params.setId} version=${params.labelVersion} embedding=${embeddingProfile.model}@${embeddingProfile.version}: ${sections.length} sections, ${toPersist.length} chunks`,
    );

    return { chunksWritten: toPersist.length };
  }
}
