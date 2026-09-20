import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../../../database/database.constants';
import * as schema from '../../../database/schema';
import { labelChunk } from '../../../database/schema/label-chunk.schema';

const CITATION_ID_PATTERN = /^label-chunk-(\d+)$/;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

export interface ChatCitationDto {
  citationId: string;
  setId: string;
  section: string;
  text: string;
  labelUrl: string;
}

@Injectable()
export class GetChatCitationService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async getCitation(citationId: string): Promise<ChatCitationDto> {
    const match = CITATION_ID_PATTERN.exec(citationId);

    if (!match) {
      throw new BadRequestException('Invalid citation ID');
    }

    const chunkId = Number(match[1]);

    if (
      !Number.isSafeInteger(chunkId) ||
      chunkId <= 0 ||
      chunkId > POSTGRES_INTEGER_MAX
    ) {
      throw new BadRequestException('Invalid citation ID');
    }

    const [row] = await this.db
      .select({
        id: labelChunk.id,
        setId: labelChunk.setId,
        section: labelChunk.section,
        text: labelChunk.text,
      })
      .from(labelChunk)
      .where(eq(labelChunk.id, chunkId))
      .limit(1);

    if (!row) {
      throw new NotFoundException('Citation not found');
    }

    return {
      citationId,
      setId: row.setId,
      section: row.section,
      text: row.text,
      labelUrl:
        `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=` +
        encodeURIComponent(row.setId),
    };
  }
}
