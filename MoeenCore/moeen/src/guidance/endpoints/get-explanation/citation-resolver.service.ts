import { Inject, Injectable, Logger } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../../../database/database.constants';
import * as schema from '../../../database/schema';
import { labelChunk } from '../../../database/schema/label-chunk.schema';

export interface ResolvedCitation {
  citationId: string;
  setId: string;
  section: string;
}

const CITATION_ID_PATTERN = /^label-chunk-(\d+)$/;

/**
 * Turns the bare citationIds on a GuidanceResponse into enough to deep-link
 * a patient to the label section a claim came from — CX-2's retriever is
 * the only thing that mints citationIds (`label-chunk-${label_chunk.id}`,
 * see retriever.service.ts), so parsing that same format back is reading a
 * convention this same person already owns, not a new cross-boundary
 * assumption.
 */
@Injectable()
export class CitationResolver {
  private readonly logger = new Logger(CitationResolver.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async resolve(citationIds: string[]): Promise<ResolvedCitation[]> {
    if (citationIds.length === 0) return [];

    const idByCitationId = new Map<string, number>();
    for (const citationId of citationIds) {
      const match = CITATION_ID_PATTERN.exec(citationId);
      if (!match) {
        this.logger.warn(
          `Unrecognized citationId format, skipping: "${citationId}"`,
        );
        continue;
      }
      idByCitationId.set(citationId, Number(match[1]));
    }

    if (idByCitationId.size === 0) return [];

    const rows = await this.db
      .select({
        id: labelChunk.id,
        setId: labelChunk.setId,
        section: labelChunk.section,
      })
      .from(labelChunk)
      .where(inArray(labelChunk.id, [...idByCitationId.values()]));

    const rowById = new Map(rows.map((row) => [row.id, row]));

    const resolved: ResolvedCitation[] = [];
    for (const [citationId, chunkId] of idByCitationId) {
      const row = rowById.get(chunkId);
      if (!row) {
        this.logger.warn(
          `Citation "${citationId}" did not resolve to a label_chunk row`,
        );
        continue;
      }
      resolved.push({ citationId, setId: row.setId, section: row.section });
    }

    return resolved;
  }
}
