import { Injectable, Inject, Logger } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { guidanceMessage } from '../../database/schema/guidance-message.schema';
import { GuidanceResponse } from '../contracts';

@Injectable()
export class GuidanceMessageWriter {
  private readonly logger = new Logger(GuidanceMessageWriter.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Best-effort cache write. If scheduleTimeId is null (the schedule-time
   * was deleted after this dose was generated), the response still exists
   * and was still delivered/logged upstream — it just never becomes
   * readable through GET /doses/today's cache. Logged, not thrown; a
   * caching miss must never undo a successful guidance run.
   */
  async write(
    scheduleTimeId: number | null,
    date: string,
    response: GuidanceResponse,
    safetyRunId: string | null = null,
  ): Promise<void> {
    if (scheduleTimeId === null) {
      this.logger.warn(
        `Skipping guidance_message write — scheduleTimeId is null for date ${date}`,
      );
      return;
    }

    await this.db
      .insert(guidanceMessage)
      .values({
        scheduleTimeId,
        date,
        text: response.text,
        citations: response.citationIds,
        validationStatus: response.validationStatus,
        safetyRunId,
      })
      .onConflictDoUpdate({
        target: [guidanceMessage.scheduleTimeId, guidanceMessage.date],
        set: {
          text: response.text,
          citations: response.citationIds,
          validationStatus: response.validationStatus,
          safetyRunId,
          generatedAt: new Date(),
        },
      });
  }
}
