import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../database.constants';
import * as schema from '../schema';

type Database = NodePgDatabase<typeof schema>;

export type EmergencyAccessAuditAction =
  (typeof schema.emergencyAccessAuditActionEnum.enumValues)[number];

@Injectable()
export class EmergencyAccessAuditRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: Database,
  ) {}

  /**
   * Appends one `emergency_access_audit` row. `created_at` is left to the DB
   * default. The table's append-only trigger means rows written here can never
   * be updated or deleted by application code.
   */
  async recordAccessEvent(
    userId: number,
    action: EmergencyAccessAuditAction,
  ): Promise<void> {
    await this.db
      .insert(schema.emergencyAccessAudit)
      .values({ userId, action });
  }
}
