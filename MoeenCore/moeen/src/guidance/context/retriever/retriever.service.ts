import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, cosineDistance, eq, inArray, lte, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../../../database/database.constants';
import * as schema from '../../../database/schema';
import {
  assertEmbeddingProfile,
  assertEmbeddingVector,
  EmbeddingProvider,
  EMBEDDING_PROVIDER,
} from '../../../knowledge/label-processing/embedding-provider';
import { GuidanceIntent, LabelSection, RetrievalResult } from '../../contracts';
import { RetrieveEvidenceParams, RetrieverPort } from './retriever.port';
import { resolveQueryText } from './query-text';
import { sectionPriority } from './section-priority';

type Database = NodePgDatabase<typeof schema>;

const DEFAULT_K = 8;
// A cosine distance of 0 is an identical vector, 2 is the opposite one.
// 0.5 (a minimum cosine similarity of 0.5) is an untuned starting point —
// not measured against anything real yet.
const DEFAULT_SIMILARITY_THRESHOLD = 0.5;

@Injectable()
export class RetrieverService implements RetrieverPort {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: Database,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly configService: ConfigService,
  ) {}

  async retrieve(params: RetrieveEvidenceParams): Promise<RetrievalResult> {
    const ingredientNames = params.scope.medications.map(
      (m) => m.ingredientName,
    );
    const findingSubjectUserMedicationIds =
      params.intent === 'explain_finding'
        ? [...new Set(params.findingSubjectUserMedicationIds)]
        : undefined;

    if (
      findingSubjectUserMedicationIds?.some(
        (id) => !Number.isSafeInteger(id) || id <= 0,
      )
    ) {
      throw new Error(
        'Finding subject user medication IDs must be positive safe integers',
      );
    }

    // Nothing to scope the hard filter to — no medication, no chunk. Short
    // circuits before spending an embedding call on a query that can only
    // ever come back empty.
    const hasMedicationScope =
      findingSubjectUserMedicationIds !== undefined
        ? findingSubjectUserMedicationIds.length > 0
        : ingredientNames.length > 0;
    if (!hasMedicationScope || params.sections.length === 0) {
      return { found: false };
    }

    const queryText = resolveQueryText(
      params.intent,
      params.scope,
      params.question,
    );
    const embeddingProfile = { ...this.embeddingProvider.profile };
    assertEmbeddingProfile(embeddingProfile);
    const queryEmbedding = await this.embeddingProvider.embed(queryText);
    assertEmbeddingVector(queryEmbedding, embeddingProfile);

    const rows = await this.runEvidenceQuery({
      ingredientNames,
      findingSubjectUserMedicationIds,
      intent: params.intent,
      sections: params.sections,
      queryEmbedding,
      embeddingModel: embeddingProfile.model,
      embeddingVersion: embeddingProfile.version,
      limit: this.getK(),
      maxDistance: 1 - this.getSimilarityThreshold(),
    });

    // Below-threshold rows are excluded in SQL, not filtered out here — so
    // zero rows already means "nothing cleared the bar," not "nothing
    // exists." Either way it becomes the same explicit no-evidence signal.
    if (rows.length === 0) {
      return { found: false };
    }

    return {
      found: true,
      chunks: rows.map((row) => ({
        // Derived from the row's own primary key, which never changes for
        // a given label_chunk — satisfies RetrievedChunk's requirement
        // that a citationId stay stable across retrieval runs.
        citationId: `label-chunk-${row.id}`,
        setId: row.setId,
        section: row.section,
        text: row.text,
      })),
    };
  }

  /**
   * ONE query. Finding explanations use a correlated EXISTS over the exact
   * finding subject user_medication IDs; other intents use the patient's
   * ingredient names. The medication, section, embedding-profile, and threshold filters
   * all live in the WHERE clause — never applied afterward in JavaScript —
   * because the medication/section pair is a safety boundary (a patient
   * must never see another medication's label text), not a performance
   * optimisation. Ranking is two-level: section priority first (so an
   * interaction question's warnings/interactions chunks sort ahead of its
   * indications chunks regardless of embedding distance), cosine distance
   * as the tiebreak within a priority tier.
   */
  private runEvidenceQuery(args: {
    ingredientNames: string[];
    findingSubjectUserMedicationIds?: number[];
    intent: GuidanceIntent;
    sections: readonly LabelSection[];
    queryEmbedding: number[];
    embeddingModel: string;
    embeddingVersion: string;
    limit: number;
    maxDistance: number;
  }) {
    const distance = cosineDistance(
      schema.labelChunk.embedding,
      args.queryEmbedding,
    );
    const priority = this.buildPriorityCase(args.intent, args.sections);
    const medicationScope =
      args.findingSubjectUserMedicationIds !== undefined
        ? sql`exists (
            select 1
            from ${schema.userMedication}
            where ${schema.userMedication.medicationId} = ${schema.labelChunk.medicationId}
              and ${inArray(
                schema.userMedication.id,
                args.findingSubjectUserMedicationIds,
              )}
          )`
        : inArray(schema.medication.genericName, args.ingredientNames);

    return this.db
      .select({
        id: schema.labelChunk.id,
        setId: schema.labelChunk.setId,
        section: schema.labelChunk.section,
        text: schema.labelChunk.text,
      })
      .from(schema.labelChunk)
      .innerJoin(
        schema.medication,
        eq(schema.labelChunk.medicationId, schema.medication.id),
      )
      .where(
        and(
          medicationScope,
          inArray(schema.labelChunk.section, [...args.sections]),
          eq(schema.labelChunk.embeddingModel, args.embeddingModel),
          eq(schema.labelChunk.embeddingVersion, args.embeddingVersion),
          lte(distance, args.maxDistance),
        ),
      )
      .orderBy(priority, distance)
      .limit(args.limit);
  }

  private buildPriorityCase(
    intent: GuidanceIntent,
    sections: readonly LabelSection[],
  ) {
    const cases = sections.map(
      (section) =>
        sql`when ${schema.labelChunk.section} = ${section} then ${sectionPriority(intent, section)}`,
    );
    return sql`(case ${sql.join(cases, sql` `)} else 1 end)`;
  }

  private getK(): number {
    const configured = Number(
      this.configService.get<string>('RETRIEVER_K') ?? DEFAULT_K,
    );
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_K;
  }

  private getSimilarityThreshold(): number {
    const configured = Number(
      this.configService.get<string>('RETRIEVER_SIMILARITY_THRESHOLD') ??
        DEFAULT_SIMILARITY_THRESHOLD,
    );
    return Number.isFinite(configured) && configured >= 0 && configured <= 1
      ? configured
      : DEFAULT_SIMILARITY_THRESHOLD;
  }
}
