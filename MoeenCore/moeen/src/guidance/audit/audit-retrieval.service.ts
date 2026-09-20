import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, gte, lte } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { auditLog } from '../../database/schema/audit-log.schema';

/**
 * Query only — this is the internal service the eventual admin endpoint
 * calls once the team decides how admin access is actually enforced. No
 * HTTP controller and no auth guard here: this codebase has no existing
 * admin/privileged-route pattern anywhere (checked before writing this —
 * every controller uses the same authenticated-patient FirebaseAuthGuard),
 * so inventing one now would mean guessing at a decision the team hasn't
 * made yet.
 */
@Injectable()
export class AuditRetrievalService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  async findForPatientInRange(patientId: number, from: Date, to: Date) {
    return this.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, patientId),
          gte(auditLog.createdAt, from),
          lte(auditLog.createdAt, to),
        ),
      )
      .orderBy(auditLog.createdAt);
  }
}
