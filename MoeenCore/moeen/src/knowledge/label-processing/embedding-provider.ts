import { createHash } from 'node:crypto';

import { EMBEDDING_DIMENSIONS } from '../../database/schema/label-chunk.schema';

export interface EmbeddingProfile {
  /** Stable model/vector-space identifier, not a deployment display name. */
  readonly model: string;
  /** Revision of the model or preprocessing that changes vector semantics. */
  readonly version: string;
  readonly dimensions: number;
}

export interface EmbeddingProvider {
  readonly profile: EmbeddingProfile;
  /** Returns a vector of exactly EMBEDDING_DIMENSIONS length. */
  embed(text: string): Promise<number[]>;
}

export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

export const DETERMINISTIC_EMBEDDING_PROFILE: EmbeddingProfile = Object.freeze({
  model: 'deterministic-sha256',
  version: 'v1',
  dimensions: EMBEDDING_DIMENSIONS,
});

/**
 * No real embedding provider is wired yet — which model/vendor to use is
 * still an open decision (see the 1536-dimension note in
 * label-chunk.schema.ts), not something to presume here. This fake is the
 * default and what every test uses; swapping in a real provider means
 * implementing this interface and changing the DI binding in
 * label-processing.module.ts, not touching anything downstream.
 *
 * Deterministic: the same text always produces the same vector (seeded
 * from a hash of the text), so tests can assert equality/reproducibility
 * without needing real semantic similarity. Any implementation change that
 * changes its vector space must also change profile.version.
 */
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly profile = DETERMINISTIC_EMBEDDING_PROFILE;

  embed(text: string): Promise<number[]> {
    const seed = createHash('sha256').update(text).digest();
    const random = mulberry32(seed.readUInt32LE(0));

    const vector = Array.from(
      { length: EMBEDDING_DIMENSIONS },
      () => random() * 2 - 1,
    );

    return Promise.resolve(normalize(vector));
  }
}

export function assertEmbeddingProfile(
  profile: EmbeddingProfile,
): asserts profile is EmbeddingProfile {
  if (!profile.model.trim() || profile.model.length > 100) {
    throw new Error('Embedding model must be between 1 and 100 characters');
  }
  if (!profile.version.trim() || profile.version.length > 100) {
    throw new Error('Embedding version must be between 1 and 100 characters');
  }
  if (profile.dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding profile ${profile.model}@${profile.version} has ${profile.dimensions} dimensions; expected ${EMBEDDING_DIMENSIONS}`,
    );
  }
}

export function assertEmbeddingVector(
  vector: readonly number[],
  profile: EmbeddingProfile,
): void {
  assertEmbeddingProfile(profile);
  if (vector.length !== profile.dimensions) {
    throw new Error(
      `Embedding provider ${profile.model}@${profile.version} returned ${vector.length} dimensions; expected ${profile.dimensions}`,
    );
  }
  if (!vector.every(Number.isFinite)) {
    throw new Error(
      `Embedding provider ${profile.model}@${profile.version} returned a non-finite value`,
    );
  }
  if (!vector.some((value) => value !== 0)) {
    throw new Error(
      `Embedding provider ${profile.model}@${profile.version} returned a zero vector`,
    );
  }
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vector;
  return vector.map((v) => v / magnitude);
}
