import {
  GuidanceResponse,
  GuidanceValidationContext,
  RetrievalResult,
} from '../contracts';
import { ProviderDispatchResult } from '../generation/provider-gateway/provider-gateway.port';

/**
 * PLACEHOLDER — GN-3 (Alaa's validation story) hasn't started. Takes both
 * the raw dispatch result and what was actually retrieved, so the real
 * implementation can validate citations against the true retrieved set —
 * exactly the check GN-3's own task text requires.
 */
export interface ValidatorPort {
  validate(
    dispatch: ProviderDispatchResult,
    retrieval: RetrievalResult,
    promptVersion: string,
    context: GuidanceValidationContext,
  ): Promise<GuidanceResponse>;
}

export const VALIDATOR_PORT = Symbol('VALIDATOR_PORT');
