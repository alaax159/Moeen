import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { lt, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { auditLog } from '../../database/schema/audit-log.schema';

// PLACEHOLDER — 2 years is a reasonable starting guess, not a policy
// decision. The real retention window is pending sign-off from the team;
// change this once that's settled, don't treat it as correct as-is.
const DEFAULT_RETENTION_DAYS = 365 * 2;

/**
 * First real @Cron usage in this codebase. ScheduleModule.forRoot() has
 * been registered in app.module.ts since day one, but grepping the whole
 * src/ tree before writing this turned up zero existing @Cron/@Interval/
 * @Timeout usages anywhere — every other scheduled-seeming thing here is
 * either a one-shot BullMQ delayed job or an OnApplicationBootstrap hook.
 *
 * audit_log's append-only trigger (drizzle/0001_audit_log_append_only.sql)
 * rejects every DELETE unless the deleting transaction first runs
 * SET LOCAL audit_log.retention_purge = 'on' inside that same transaction.
 * This is the one place in the app permitted to do that.
 */
@Injectable()
export class AuditRetentionService {
  private readonly logger = new Logger(AuditRetentionService.name);

  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeExpiredAuditLogs(retentionDays: number = DEFAULT_RETENTION_DAYS): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL audit_log.retention_purge = 'on'`);
      await tx.delete(auditLog).where(lt(auditLog.createdAt, cutoff));
    });

    this.logger.log(
      `Purged audit_log rows older than ${cutoff.toISOString()} (retention window: ${retentionDays} days)`,
    );
  }
}
