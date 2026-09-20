import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../database.constants';
import * as schema from '../schema';

type Database = NodePgDatabase<typeof schema>;
export type EmergencyAccess = typeof schema.emergencyAccess.$inferSelect;

@Injectable()
export class EmergencyAccessRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: Database,
  ) {}

  async findByUserId(userId: number): Promise<EmergencyAccess | null> {
    const [access] = await this.db
      .select()
      .from(schema.emergencyAccess)
      .where(eq(schema.emergencyAccess.userId, userId))
      .limit(1);

    return access ?? null;
  }

  async findEnabledOwnerByTokenHash(
    tokenHash: string,
  ): Promise<{ userId: number } | null> {
    const [access] = await this.db
      .select({ userId: schema.emergencyAccess.userId })
      .from(schema.emergencyAccess)
      .where(
        and(
          eq(schema.emergencyAccess.tokenHash, tokenHash),
          eq(schema.emergencyAccess.enabled, true),
        ),
      )
      .limit(1);

    return access ?? null;
  }

  async createEnabled(
    userId: number,
    tokenHash: string,
  ): Promise<EmergencyAccess | null> {
    const [access] = await this.db
      .insert(schema.emergencyAccess)
      .values({ userId, tokenHash, enabled: true, version: 1 })
      .onConflictDoNothing({ target: schema.emergencyAccess.userId })
      .returning();

    return access ?? null;
  }

  async reEnable(
    userId: number,
    expectedVersion: number,
    tokenHash: string,
  ): Promise<EmergencyAccess | null> {
    return this.updateWithVersion(userId, expectedVersion, {
      tokenHash,
      enabled: true,
    });
  }

  async regenerate(
    userId: number,
    expectedVersion: number,
    tokenHash: string,
  ): Promise<EmergencyAccess | null> {
    return this.updateWithVersion(
      userId,
      expectedVersion,
      { tokenHash, enabled: true },
      true,
    );
  }

  async disable(
    userId: number,
    expectedVersion: number,
  ): Promise<EmergencyAccess | null> {
    return this.updateWithVersion(userId, expectedVersion, {
      tokenHash: null,
      enabled: false,
    });
  }

  private async updateWithVersion(
    userId: number,
    expectedVersion: number,
    values: Pick<EmergencyAccess, 'enabled' | 'tokenHash'>,
    requireEnabled = false,
  ): Promise<EmergencyAccess | null> {
    const [access] = await this.db
      .update(schema.emergencyAccess)
      .set({
        ...values,
        version: sql`${schema.emergencyAccess.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.emergencyAccess.userId, userId),
          eq(schema.emergencyAccess.version, expectedVersion),
          ...(requireEnabled ? [eq(schema.emergencyAccess.enabled, true)] : []),
        ),
      )
      .returning();

    return access ?? null;
  }
}
