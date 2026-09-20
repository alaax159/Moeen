import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, lte, or, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../../database/database.constants';
import * as schema from '../../database/schema';

type Database = NodePgDatabase<typeof schema>;
export type SafetyRecheckOutboxRow =
  typeof schema.medicationSafetyRecheckOutbox.$inferSelect;

const PROCESSING_LEASE_MS = 5 * 60 * 1000;

@Injectable()
export class MedicationSafetyRecheckOutboxRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async claimBatch(limit = 20): Promise<SafetyRecheckOutboxRow[]> {
    const now = new Date();
    const leaseExpiredAt = new Date(now.getTime() - PROCESSING_LEASE_MS);

    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(schema.medicationSafetyRecheckOutbox)
        .where(
          or(
            and(
              inArray(schema.medicationSafetyRecheckOutbox.status, [
                'pending',
                'failed',
              ]),
              lte(schema.medicationSafetyRecheckOutbox.availableAt, now),
            ),
            and(
              eq(schema.medicationSafetyRecheckOutbox.status, 'processing'),
              lte(
                schema.medicationSafetyRecheckOutbox.lockedAt,
                leaseExpiredAt,
              ),
            ),
          ),
        )
        .orderBy(asc(schema.medicationSafetyRecheckOutbox.createdAt))
        .limit(limit)
        .for('update', { skipLocked: true });

      if (rows.length === 0) return [];

      return tx
        .update(schema.medicationSafetyRecheckOutbox)
        .set({
          status: 'processing',
          attempts: sql`${schema.medicationSafetyRecheckOutbox.attempts} + 1`,
          lockedAt: now,
          updatedAt: now,
        })
        .where(
          inArray(
            schema.medicationSafetyRecheckOutbox.id,
            rows.map(({ id }) => id),
          ),
        )
        .returning();
    });
  }

  async markCompleted(id: string): Promise<void> {
    const now = new Date();
    await this.db
      .update(schema.medicationSafetyRecheckOutbox)
      .set({
        status: 'completed',
        processedAt: now,
        lockedAt: null,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(schema.medicationSafetyRecheckOutbox.id, id));
  }

  async recordFailure(
    id: string,
    attempts: number,
    error: string,
    maxAttempts: number,
  ): Promise<void> {
    const now = new Date();
    const retryDelayMs = Math.min(60_000, 1000 * 2 ** (attempts - 1));
    await this.db
      .update(schema.medicationSafetyRecheckOutbox)
      .set({
        status: attempts >= maxAttempts ? 'dead_letter' : 'failed',
        availableAt: new Date(now.getTime() + retryDelayMs),
        lockedAt: null,
        lastError: error.slice(0, 2000),
        updatedAt: now,
      })
      .where(eq(schema.medicationSafetyRecheckOutbox.id, id));
  }
}
