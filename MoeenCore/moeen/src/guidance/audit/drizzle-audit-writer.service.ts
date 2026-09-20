import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { auditLog } from '../../database/schema/audit-log.schema';
import {
  AuditHookPort,
  AuditRecordInput,
} from '../orchestrator/audit-hook.port';
import { RedactionFailedError } from '../context/redactor/redaction-failed.error';

type RedactionStatus = 'ok' | 'aborted';

@Injectable()
export class DrizzleAuditWriter implements AuditHookPort {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async record(input: AuditRecordInput): Promise<void> {
    await this.db.insert(auditLog).values({
      userId: input.request.patientId,
      intent: input.request.intent,
      trigger: input.trigger,
      promptVersion: input.promptVersion ?? null,
      safetyRunId: input.request.safetyRunId ?? null,
      retrievedCitationIds: input.citationIds ?? [],
      redactionStatus: this.deriveRedactionStatus(input),
      validationStatus: input.validationStatus ?? null,
      tokensIn: null, // no usage source on current main — GN-2 adds this once merged
      tokensOut: null,
    });
  }

  private deriveRedactionStatus(input: AuditRecordInput): RedactionStatus {
    if (input.outcome === 'success') return 'ok';
    // stage alone can't tell redaction-abort from an unrelated provider
    // failure today — the preserved original error can.
    if (input.failure?.cause instanceof RedactionFailedError) return 'aborted';
    return 'ok';
  }
}
