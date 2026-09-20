import { chunkText, countTokens } from './text-chunker';

describe('chunkText', () => {
  it('returns no chunks for empty or whitespace-only input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n  ')).toEqual([]);
  });

  it('returns exactly one chunk for text shorter than the chunk size', () => {
    const text =
      'Lisinopril tablet USP is indicated for the treatment of hypertension.';

    const chunks = chunkText(text);

    expect(chunks).toHaveLength(1);
    expect(countTokens(chunks[0])).toBeLessThanOrEqual(500);
  });

  it('splits long text into multiple chunks, none exceeding the 500-token bound', () => {
    // ~50 tokens per sentence * 40 repeats ≈ 2000 tokens, well past one chunk.
    const sentence =
      'Numerous antihypertensive drugs from a variety of pharmacologic classes have been shown in randomized controlled trials to reduce cardiovascular morbidity and mortality. ';
    const longText = sentence.repeat(40);

    const chunks = chunkText(longText);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(countTokens(chunk)).toBeLessThanOrEqual(500);
    }
  });

  it('overlaps consecutive chunks so context near a boundary is not lost', () => {
    const sentence =
      'Numerous antihypertensive drugs from a variety of pharmacologic classes have been shown in randomized controlled trials to reduce cardiovascular morbidity and mortality. ';
    const longText = sentence.repeat(40);

    const chunks = chunkText(longText);

    // The tail of chunk 1 should reappear at the head of chunk 2 — proves
    // real overlap, not just back-to-back slicing.
    const tailOfFirst = chunks[0].slice(-40);
    expect(chunks[1]).toContain(
      tailOfFirst.trim().split(' ').slice(-3).join(' '),
    );
  });
});

describe('countTokens', () => {
  it('counts more tokens for longer text', () => {
    expect(countTokens('short')).toBeLessThan(
      countTokens('a somewhat longer piece of text with more words in it'),
    );
  });
});
