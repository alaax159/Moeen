import { encode, decode } from 'gpt-tokenizer';

const CHUNK_SIZE_TOKENS = 500;
const CHUNK_OVERLAP_TOKENS = 50;
const STEP_TOKENS = CHUNK_SIZE_TOKENS - CHUNK_OVERLAP_TOKENS;

export function countTokens(text: string): number {
  return encode(text).length;
}

/**
 * Splits text into ~500-token chunks with ~50-token overlap between
 * consecutive chunks, so a chunk cut near a sentence boundary doesn't lose
 * context that spilled into the next one. Cuts at token boundaries (via
 * encode/decode), not characters or words, so "no chunk exceeds the token
 * bound" holds exactly, not approximately.
 *
 * Empty/whitespace-only input produces zero chunks — never a phantom empty
 * chunk. Text shorter than one chunk produces exactly one.
 */
export function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const tokens = encode(trimmed);
  const chunks: string[] = [];

  for (let start = 0; start < tokens.length; start += STEP_TOKENS) {
    const slice = tokens.slice(start, start + CHUNK_SIZE_TOKENS);
    chunks.push(decode(slice));

    // The last chunk may end exactly at the text's end — no need for a
    // trailing near-duplicate chunk that's almost entirely overlap.
    if (start + CHUNK_SIZE_TOKENS >= tokens.length) break;
  }

  return chunks;
}
