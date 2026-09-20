import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { count, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../database/database.constants';
import * as schema from '../database/schema';
import { emergencyAccessAudit } from '../database/schema/emergency-access-audit.schema';
import { emergencyAccess } from '../database/schema/emergency-access.schema';

/**
 * Daily check that every emergency_access record carries the audit rows it
 * should. `emergency_access.version` counts lifecycle mutations (enable /
 * regenerate / disable); each writes exactly one emergency_access_audit row,
 * best-effort — see EmergencyAccessService.recordAccessEvent. The expected
 * audit-row count is therefore `version - audit_baseline_version`, where the
 * baseline freezes mutations that predate audit logging (see
 * 0019_emergency_access_audit_baseline.sql).
 *
 * Detection only. A mismatch means a best-effort write was lost past its
 * retries; it is logged for an operator, never auto-repaired — the
 * append-only table cannot be back-filled truthfully after the fact.
 * Structure follows AuditRetentionService.
 */
@Injectable()
export class EmergencyAccessAuditReconcilerService {
  private readonly logger = new Logger(
    EmergencyAccessAuditReconcilerService.name,
  );

  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async reconcileAuditCounts(): Promise<void> {
    const rows = await this.db
      .select({
        userId: emergencyAccess.userId,
        version: emergencyAccess.version,
        baseline: emergencyAccess.auditBaselineVersion,
        auditCount: count(emergencyAccessAudit.id),
      })
      .from(emergencyAccess)
      .leftJoin(
        emergencyAccessAudit,
        eq(emergencyAccessAudit.userId, emergencyAccess.userId),
      )
      .groupBy(
        emergencyAccess.userId,
        emergencyAccess.version,
        emergencyAccess.auditBaselineVersion,
      );

    let mismatches = 0;
    for (const row of rows) {
      const actual = Number(row.auditCount);
      const expected = row.version - row.baseline;
      if (actual !== expected) {
        mismatches += 1;
        this.logger.warn(
          `emergency_access_audit count mismatch for userId=${row.userId}: ` +
            `actual=${actual} expected=${expected} ` +
            `(version=${row.version}, baseline=${row.baseline})`,
        );
      }
    }

    this.logger.log(
      `Reconciled emergency_access_audit for ${rows.length} record(s), ` +
        `${mismatches} mismatch(es)`,
    );
  }
}
