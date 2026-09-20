import { Injectable } from '@nestjs/common';
import type { RetrievedChunk } from '../../contracts';

export const NO_EXCERPTS_NOTICE =
  'NONE. No reference excerpts were supplied for this request. You may not make any factual claim about a medicine, and you must return an empty citationIds array.';

/**
 * Renders retrieved chunks so the model can see, and copy back, the exact
 * citation id for each one.
 *
 * The id leads each excerpt rather than trailing it: the model reads the id
 * before the text it labels, which is what we want it to associate. setId is
 * deliberately not rendered — it is an internal document identifier the model
 * has no use for, and every field we do not send is a field that cannot leak
 * or be echoed into an answer.
 */
@Injectable()
export class ChunkFormatter {
  format(chunks: RetrievedChunk[]): string {
    if (chunks.length === 0) return NO_EXCERPTS_NOTICE;

    return chunks
      .map((chunk) =>
        [
          `[citation id: ${chunk.citationId}]`,
          `Label section: ${chunk.section}`,
          chunk.text,
        ].join('\n'),
      )
      .join('\n\n');
  }

  citationIdsOf(chunks: RetrievedChunk[]): string[] {
    return chunks.map((chunk) => chunk.citationId);
  }
}
