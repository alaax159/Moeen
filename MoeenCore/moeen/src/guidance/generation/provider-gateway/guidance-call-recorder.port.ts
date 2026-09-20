import type { GuidanceIntent } from '../../contracts';
import { guidanceCallStatusEnum } from '../../../database/schema/guidance-call.schema';

/**
 * Derived from the column's own enum rather than retyped, so adding a status
 * to the table without handling it here is a compile error instead of a
 * runtime insert failure.
 */
export type GuidanceCallStatus =
  (typeof guidanceCallStatusEnum.enumValues)[number];

export interface GuidanceCallRecord {
  patientId: number;
  intent: GuidanceIntent;
  /** Null when the call never reached the provider — rate-limited, circuit-open, or rejected before dispatch. */
  tokensIn: number | null;
  tokensOut: number | null;
  /** Measured across the whole dispatch, retries included, so the number matches what the patient waited. */
  latencyMs: number;
  status: GuidanceCallStatus;
}

/**
 * One row per model call, so cost is visible from the first day rather than
 * from the first surprise invoice.
 *
 * Deliberately not the audit log: audit_log is one append-only row per whole
 * pipeline run and belongs to DL-4, this is one row per provider call and
 * exists to be summed.
 */
export interface GuidanceCallRecorderPort {
  record(call: GuidanceCallRecord): Promise<void>;
}

export const GUIDANCE_CALL_RECORDER = Symbol('GUIDANCE_CALL_RECORDER');
