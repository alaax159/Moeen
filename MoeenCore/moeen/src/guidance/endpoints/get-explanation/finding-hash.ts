import { createHash } from 'crypto';

import { SafetyCheckResult, SafetyFinding } from '../../contracts';
import { PROMPT_VERSION } from '../../generation/prompt-assembler/prompt-version';
import { VALIDATION_POLICY_VERSION } from '../../generation/response-validator/validation-policy-version';

export interface ExplanationCachePolicy {
  promptVersion: string;
  validationPolicyVersion: string;
}

export const EXPLANATION_CACHE_POLICY: Readonly<ExplanationCachePolicy> =
  Object.freeze({
    promptVersion: PROMPT_VERSION,
    validationPolicyVersion: VALIDATION_POLICY_VERSION,
  });

/**
 * Cache identity for one finding in one immutable safety run.
 *
 * The generated prompt includes patient and RAG context selected around that
 * exact run. Reusing an explanation merely because a later run rediscovered
 * similar finding text would detach the answer from its safety provenance.
 * The run, context, engine and dataset versions therefore all participate.
 *
 * Prompt and validation policy versions are separate fences: changing how the
 * model is instructed and changing what output is accepted are independent
 * reasons not to serve an older response.
 */
export function findingHash(
  check: SafetyCheckResult,
  finding: SafetyFinding,
  policy: Readonly<ExplanationCachePolicy> = EXPLANATION_CACHE_POLICY,
): string {
  const canonical = stableJson({
    cacheFormat: 2,
    policy,
    run: {
      id: check.runId,
      patientId: check.patientId,
      contextHash: check.contextHash,
      engineVersion: check.engineVersion,
      datasetVersions: check.datasetVersions,
    },
    finding: {
      id: finding.id ?? null,
      key: finding.findingKey ?? null,
      type: finding.type,
      severity: finding.severity,
      rationale: finding.rationale,
      subjectUserMedicationIds: [...finding.subjectUserMedicationIds].sort(
        (a, b) => a - b,
      ),
      subjectUserAllergyId: finding.subjectUserAllergyId ?? null,
      subjectUserConditionId: finding.subjectUserConditionId ?? null,
      evidence: [...finding.evidence].sort((left, right) =>
        compareText(stableJson(left), stableJson(right)),
      ),
    },
  });

  return createHash('sha256').update(canonical).digest('hex');
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

/** Locale-independent ordering keeps hashes identical across deployments. */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
