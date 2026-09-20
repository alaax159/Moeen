import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../../../database/database.constants';
import * as schema from '../../../database/schema';
import { findingExplanation } from '../../../database/schema/finding-explanation.schema';
import { ValidationStatus } from '../../contracts';

export interface CachedExplanation {
  text: string;
  citations: string[];
  validationStatus: ValidationStatus;
}

export interface CacheableExplanation extends Omit<
  CachedExplanation,
  'validationStatus'
> {
  validationStatus: 'accepted';
}

@Injectable()
export class FindingExplanationCacheRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /** Pure read — never triggers generation. Returns null if nothing's cached yet. */
  async findByHash(findingHash: string): Promise<CachedExplanation | null> {
    const [row] = await this.db
      .select({
        text: findingExplanation.text,
        citations: findingExplanation.citations,
        validationStatus: findingExplanation.validationStatus,
      })
      .from(findingExplanation)
      .where(eq(findingExplanation.findingHash, findingHash))
      .limit(1);

    return row ?? null;
  }

  async save(
    findingHash: string,
    explanation: CacheableExplanation,
  ): Promise<void> {
    await this.db
      .insert(findingExplanation)
      .values({
        findingHash,
        text: explanation.text,
        citations: explanation.citations,
        validationStatus: explanation.validationStatus,
      })
      .onConflictDoUpdate({
        target: findingExplanation.findingHash,
        set: {
          text: explanation.text,
          citations: explanation.citations,
          validationStatus: explanation.validationStatus,
          generatedAt: new Date(),
        },
      });
  }
}
