import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ExtractTablesWithRelations, gte } from 'drizzle-orm';
import { NodePgDatabase, NodePgTransaction } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { LabelSection } from './spl-section-extractor';

type Database = NodePgDatabase<typeof schema>;
type DbOrTx =
  | Database
  | NodePgTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

export interface LabelChunkToPersist {
  medicationId: number;
  setId: string;
  labelVersion: string;
  section: LabelSection;
  ordinal: number;
  text: string;
  embedding: number[];
  embeddingModel: string;
  embeddingVersion: string;
  tokenCount: number;
}

@Injectable()
export class LabelChunkRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: Database,
  ) {}

  /**
   * Replaces one label version atomically. During an embedding upgrade,
   * retrieval therefore sees either the previous complete profile or the new
   * complete profile, never a partially rewritten document.
   */
  async replaceAll(
    setId: string,
    labelVersion: string,
    chunks: LabelChunkToPersist[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const chunk of chunks) {
        await this.upsertOne(tx, chunk);
      }

      // Remove high ordinals left behind when reprocessing produces fewer
      // chunks. For an empty result, ordinal >= 0 removes the whole document.
      await tx
        .delete(schema.labelChunk)
        .where(
          and(
            eq(schema.labelChunk.setId, setId),
            eq(schema.labelChunk.labelVersion, labelVersion),
            gte(schema.labelChunk.ordinal, chunks.length),
          ),
        );
    });
  }

  private async upsertOne(
    executor: DbOrTx,
    chunk: LabelChunkToPersist,
  ): Promise<void> {
    await executor
      .insert(schema.labelChunk)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          schema.labelChunk.setId,
          schema.labelChunk.labelVersion,
          schema.labelChunk.ordinal,
        ],
        set: {
          medicationId: chunk.medicationId,
          section: chunk.section,
          text: chunk.text,
          embedding: chunk.embedding,
          embeddingModel: chunk.embeddingModel,
          embeddingVersion: chunk.embeddingVersion,
          tokenCount: chunk.tokenCount,
        },
      });
  }
}
