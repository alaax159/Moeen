import { GuidanceRequest, ValidationStatus } from '../contracts';
import { PipelineFailure } from './pipeline-failure';

/** Matches audit_log.trigger's real DB enum exactly. "What kicked this run
 * off" — separate from GuidanceRequest.intent, which answers "what kind of
 * guidance was requested." */
export type AuditTrigger = 'patient_chat' | 'missed_dose_job' | 'explain_finding_request';

export interface AuditRecordInput {
  request: GuidanceRequest;
  trigger: AuditTrigger;
  outcome: 'success' | 'failure';
  failure?: PipelineFailure;
  promptVersion?: string;
  citationIds?: string[];
  validationStatus?: ValidationStatus;
}

/**
 * Marked hook for DL-4 (Salam's own next story) to fill in with a real
 * append-only writer. A no-op default keeps the orchestrator honest — it
 * genuinely calls this on every run, success or failure, rather than
 * silently pretending an audit trail exists before one does.
 */
export interface AuditHookPort {
  record(input: AuditRecordInput): Promise<void>;
}

export const AUDIT_HOOK_PORT = Symbol('AUDIT_HOOK_PORT');

export class NoopAuditHook implements AuditHookPort {
  async record(): Promise<void> {
    // Intentionally empty — DL-4 replaces this with a real writer.
  }
}
