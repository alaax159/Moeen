import { Inject, Injectable } from '@nestjs/common';
import { and, eq, exists, isNotNull, ne, notExists, or } from 'drizzle-orm';
import { NodePgDatabase, NodePgTransaction } from 'drizzle-orm/node-postgres';
import { ExtractTablesWithRelations } from 'drizzle-orm';

import { DRIZZLE } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { enqueueLabelSafetyInvalidation } from '../../medication-safety/invalidation/safety-invalidation.writer';

type Database = NodePgDatabase<typeof schema>;
type DbOrTx =
  | Database
  | NodePgTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

export interface MedicationNeedingIngestion {
  medicationId: number;
  dailyMedId: string;
}

export interface LabelDocumentNeedingEmbedding {
  medicationId: number;
  setId: string;
  labelVersion: string;
}

@Injectable()
export class LabelDocumentRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: Database,
  ) {}

  /**
   * Every verified DailyMed medication with no label_document row at all —
   * the boot-time reconciliation query (see label-ingestion.reconciler.ts).
   * Catches a MedicationVerifiedEvent lost in memory (process crash between
   * the medication transaction committing and queue.add() landing in
   * Redis, or queue.add() itself throwing) — since the medication already
   * exists once verified, resolveMedicationId's existing-row branch means
   * that event will never fire again for it.
   *
   * Deliberately does NOT include medications with a 'failed' row — that's
   * a real attempt that ran and failed (visible via fetch_status +
   * failure_reason for a human to investigate), a different concern from
   * "never attempted at all."
   */
  async findMedicationsNeedingIngestion(): Promise<
    MedicationNeedingIngestion[]
  > {
    const rows = await this.db
      .select({
        medicationId: schema.medication.id,
        dailyMedId: schema.medication.dailyMedId,
      })
      .from(schema.medication)
      .where(
        and(
          isNotNull(schema.medication.dailyMedId),
          notExists(
            this.db
              .select()
              .from(schema.labelDocument)
              .where(
                eq(schema.labelDocument.medicationId, schema.medication.id),
              ),
          ),
        ),
      );

    return rows.map((row) => ({
      medicationId: row.medicationId,
      dailyMedId: row.dailyMedId!,
    }));
  }

  /**
   * Fetched labels with no chunks or at least one chunk from a different
   * vector space. Mixed profiles are included so a crash during a prior
   * sequential upsert is repaired on the next startup.
   */
  async findDocumentsNeedingEmbedding(
    embeddingModel: string,
    embeddingVersion: string,
  ): Promise<LabelDocumentNeedingEmbedding[]> {
    const sameDocument = and(
      eq(schema.labelChunk.setId, schema.labelDocument.setId),
      eq(schema.labelChunk.labelVersion, schema.labelDocument.labelVersion),
    );

    return this.db
      .select({
        medicationId: schema.labelDocument.medicationId,
        setId: schema.labelDocument.setId,
        labelVersion: schema.labelDocument.labelVersion,
      })
      .from(schema.labelDocument)
      .where(
        and(
          eq(schema.labelDocument.fetchStatus, 'fetched'),
          isNotNull(schema.labelDocument.rawContent),
          or(
            notExists(
              this.db
                .select({ id: schema.labelChunk.id })
                .from(schema.labelChunk)
                .where(sameDocument),
            ),
            exists(
              this.db
                .select({ id: schema.labelChunk.id })
                .from(schema.labelChunk)
                .where(
                  and(
                    sameDocument,
                    or(
                      ne(schema.labelChunk.embeddingModel, embeddingModel),
                      ne(schema.labelChunk.embeddingVersion, embeddingVersion),
                    ),
                  ),
                ),
            ),
          ),
        ),
      );
  }

  /**
   * process-label re-reads rawContent here rather than carrying it through
   * the job payload — keeps job data small and means retries always work
   * off whatever's actually persisted, not a stale copy from enqueue time.
   */
  async findRawContent(
    setId: string,
    labelVersion: string,
  ): Promise<string | null> {
    const [row] = await this.db
      .select({ rawContent: schema.labelDocument.rawContent })
      .from(schema.labelDocument)
      .where(
        and(
          eq(schema.labelDocument.setId, setId),
          eq(schema.labelDocument.labelVersion, labelVersion),
        ),
      )
      .limit(1);

    return row?.rawContent ?? null;
  }

  /**
   * The upsert below is keyed on (set_id, label_version) — but a prior
   * metadata-fetch failure for this same setid would have been recorded
   * under the 'unknown' sentinel version (see recordFailed), a different
   * key from the real version now known. Without deleting that placeholder
   * first, a fail-then-succeed sequence would leave two permanent rows —
   * a stale 'unknown'/failed one alongside the real 'fetched' one — rather
   * than the second call replacing the first. Both statements run in one
   * transaction so there's no window where neither row exists.
   */
  /**
   * Stores a fetched label and, when its clinical content actually changed,
   * queues a safety recheck for every patient currently taking the medication
   * in the same transaction.
   *
   * Returns the patients whose safety state was invalidated. An identical
   * re-fetch returns an empty list: the label carries no new interaction or
   * contraindication data, so rechecking everyone on the drug would be a
   * stampede with nothing to find.
   */
  async recordFetched(params: {
    medicationId: number;
    setId: string;
    labelVersion: string;
    rawContent: string;
  }): Promise<{ contentChanged: boolean; invalidatedUserIds: number[] }> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          fetchStatus: schema.labelDocument.fetchStatus,
          rawContent: schema.labelDocument.rawContent,
        })
        .from(schema.labelDocument)
        .where(
          and(
            eq(schema.labelDocument.setId, params.setId),
            eq(schema.labelDocument.labelVersion, params.labelVersion),
          ),
        )
        .limit(1);

      // A first successful fetch counts as changed: interaction data the
      // safety engine could not see before is now available.
      const contentChanged =
        existing === undefined ||
        existing.fetchStatus !== 'fetched' ||
        existing.rawContent !== params.rawContent;

      await tx
        .delete(schema.labelDocument)
        .where(
          and(
            eq(schema.labelDocument.setId, params.setId),
            eq(schema.labelDocument.labelVersion, 'unknown'),
          ),
        );

      await this.upsert(tx, {
        ...params,
        fetchStatus: 'fetched',
        rawContent: params.rawContent,
        failureReason: null,
        fetchedAt: new Date(),
      });

      if (!contentChanged) {
        return { contentChanged, invalidatedUserIds: [] };
      }

      const invalidatedUserIds = await enqueueLabelSafetyInvalidation(tx, {
        medicationId: params.medicationId,
        sourceKey: `label:${params.setId}:${params.labelVersion}`,
      });

      return { contentChanged, invalidatedUserIds };
    });
  }

  async recordFailed(params: {
    medicationId: number;
    setId: string;
    labelVersion: string;
    failureReason: string;
    retryCount: number;
  }): Promise<void> {
    await this.upsert(this.db, {
      ...params,
      fetchStatus: 'failed',
      rawContent: null,
      fetchedAt: null,
    });
  }

  private async upsert(
    executor: DbOrTx,
    row: {
      medicationId: number;
      setId: string;
      labelVersion: string;
      fetchStatus: (typeof schema.labelFetchStatusEnum.enumValues)[number];
      rawContent: string | null;
      failureReason: string | null;
      retryCount?: number;
      fetchedAt: Date | null;
    },
  ): Promise<void> {
    await executor
      .insert(schema.labelDocument)
      .values({
        medicationId: row.medicationId,
        setId: row.setId,
        labelVersion: row.labelVersion,
        fetchStatus: row.fetchStatus,
        rawContent: row.rawContent,
        failureReason: row.failureReason,
        retryCount: row.retryCount ?? 0,
        fetchedAt: row.fetchedAt,
      })
      .onConflictDoUpdate({
        target: [schema.labelDocument.setId, schema.labelDocument.labelVersion],
        set: {
          fetchStatus: row.fetchStatus,
          rawContent: row.rawContent,
          failureReason: row.failureReason,
          ...(row.retryCount !== undefined
            ? { retryCount: row.retryCount }
            : {}),
          fetchedAt: row.fetchedAt,
        },
      });
  }
}
