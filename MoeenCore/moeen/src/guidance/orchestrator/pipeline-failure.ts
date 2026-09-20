export type PipelineStage = 'scope' | 'retrieve' | 'assemble' | 'call' | 'validate';

/**
 * Every stage fails differently today — RedactorPort throws synchronously,
 * ProviderGatewayPort rejects a promise, nothing built yet tells us how
 * scope/retrieve/assemble/validate will fail. This is the one shape all of
 * that gets converted into before it can reach the controller boundary.
 * `cause` preserves the original error for logging/audit — nothing
 * downstream ever sees the raw thrown value.
 */
export interface PipelineFailure {
  stage: PipelineStage;
  message: string;
  cause: unknown;
}

export function toPipelineFailure(stage: PipelineStage, error: unknown): PipelineFailure {
  return {
    stage,
    message: error instanceof Error ? error.message : 'Unknown pipeline stage failure',
    cause: error,
  };
}

/** Runs one stage, sync or async, and converts any throw or rejection into a PipelineFailure. */
export async function runStage<T>(stage: PipelineStage, fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toPipelineFailure(stage, error);
  }
}

export function isPipelineFailure(value: unknown): value is PipelineFailure {
  return typeof value === 'object' && value !== null && 'stage' in value && 'message' in value && 'cause' in value;
}
