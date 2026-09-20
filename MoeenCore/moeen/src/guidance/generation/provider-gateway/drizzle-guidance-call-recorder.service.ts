import { Inject, Injectable, Logger } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../../../database/database.constants';
import * as schema from '../../../database/schema';
import {
  GuidanceCallRecord,
  GuidanceCallRecorderPort,
} from './guidance-call-recorder.port';

type Database = NodePgDatabase<typeof schema>;

@Injectable()
export class DrizzleGuidanceCallRecorder implements GuidanceCallRecorderPort {
  private readonly logger = new Logger(DrizzleGuidanceCallRecorder.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async record(call: GuidanceCallRecord): Promise<void> {
    try {
      await this.db.insert(schema.guidanceCall).values({
        userId: call.patientId,
        intent: call.intent,
        tokensIn: call.tokensIn,
        tokensOut: call.tokensOut,
        latencyMs: call.latencyMs,
        status: call.status,
      });
    } catch (error) {
      // Cost bookkeeping must never cost a patient their answer. The row is
      // lost and loudly logged; the guidance run carries on.
      this.logger.error(
        `failed to record guidance_call (status=${call.status}, intent=${call.intent})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
