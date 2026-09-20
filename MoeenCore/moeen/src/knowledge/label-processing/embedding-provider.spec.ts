import {
  assertEmbeddingVector,
  DeterministicEmbeddingProvider,
} from './embedding-provider';
import { EMBEDDING_DIMENSIONS } from '../../database/schema/label-chunk.schema';

describe('DeterministicEmbeddingProvider', () => {
  const provider = new DeterministicEmbeddingProvider();

  it('returns a vector of exactly EMBEDDING_DIMENSIONS length', async () => {
    const vector = await provider.embed('hello world');
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it('declares the vector-space profile persisted and filtered by retrieval', () => {
    expect(provider.profile).toEqual({
      model: 'deterministic-sha256',
      version: 'v1',
      dimensions: EMBEDDING_DIMENSIONS,
    });
  });

  it('is deterministic: the same text always produces the same vector', async () => {
    const a = await provider.embed('lisinopril lowers blood pressure');
    const b = await provider.embed('lisinopril lowers blood pressure');
    expect(a).toEqual(b);
  });

  it('produces different vectors for different text', async () => {
    const a = await provider.embed('lisinopril lowers blood pressure');
    const b = await provider.embed('aspirin thins the blood');
    expect(a).not.toEqual(b);
  });

  it('rejects zero and non-finite vectors before they reach pgvector', () => {
    expect(() =>
      assertEmbeddingVector(
        new Array(EMBEDDING_DIMENSIONS).fill(0),
        provider.profile,
      ),
    ).toThrow(/zero vector/i);

    const invalid = new Array(EMBEDDING_DIMENSIONS).fill(0);
    invalid[0] = Number.NaN;
    expect(() => assertEmbeddingVector(invalid, provider.profile)).toThrow(
      /non-finite/i,
    );
  });
});
