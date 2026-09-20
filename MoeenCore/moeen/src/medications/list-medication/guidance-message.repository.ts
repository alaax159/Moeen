import { Injectable, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import * as schema from '../../database/schema';
import { guidanceMessage } from '../../database/schema/guidance-message.schema';

export interface GuidanceMessageRow {
  text: string;
  citations: string[];
  validationStatus: 'accepted' | 'rejected_fallback';
}

@Injectable()
export class GuidanceMessageRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  /** Pure read — never triggers generation. Returns null if nothing's cached yet. */
  async findForScheduleTimeToday(scheduleTimeId: number, today: string): Promise<GuidanceMessageRow | null> {
    const [row] = await this.db
      .select({ text: guidanceMessage.text, citations: guidanceMessage.citations, validationStatus: guidanceMessage.validationStatus })
      .from(guidanceMessage)
      .where(and(eq(guidanceMessage.scheduleTimeId, scheduleTimeId), eq(guidanceMessage.date, today)))
      .limit(1);
    return row ?? null;
  }
}
