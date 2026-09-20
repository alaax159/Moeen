import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../database.constants';
import * as schema from '../schema';

type Database = NodePgDatabase<typeof schema>;

type NewEmergencyNotificationLogRow =
  typeof schema.emergencyNotificationLog.$inferInsert;

const EMERGENCY_NOTIFICATION_LOCK_NAMESPACE = 217969;

@Injectable()
export class EmergencyNotificationLogRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async runWithUserNotificationLock<T>(
    userId: number,
    action: () => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(
          ${EMERGENCY_NOTIFICATION_LOCK_NAMESPACE}::int,
          ${userId}::int
        )`,
      );

      return action();
    });
  }

  /** One row per contact per send attempt (success or failure). */
  async record(
    entry: Pick<
      NewEmergencyNotificationLogRow,
      'userId' | 'contactId' | 'event' | 'status'
    >,
  ) {
    const [row] = await this.db
      .insert(schema.emergencyNotificationLog)
      .values(entry)
      .returning();

    return row;
  }

  /**
   * Most recent successful notification row for this user at or after `since`.
   * Failed delivery attempts must not suppress a retry.
   */
  async findRecentByUserId(userId: number, since: Date) {
    const [row] = await this.db
      .select()
      .from(schema.emergencyNotificationLog)
      .where(
        and(
          eq(schema.emergencyNotificationLog.userId, userId),
          eq(schema.emergencyNotificationLog.status, 'sent'),
          gte(schema.emergencyNotificationLog.sentAt, since),
        ),
      )
      .orderBy(desc(schema.emergencyNotificationLog.sentAt))
      .limit(1);

    return row ?? null;
  }
}
