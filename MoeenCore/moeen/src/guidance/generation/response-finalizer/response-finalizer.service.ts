import { Inject, Injectable, Logger } from '@nestjs/common';

import type {
  GuidanceValidationContext,
  GuidanceResponse,
  RetrievalResult,
  SafetyCheckSummary,
} from '../../contracts';
import type { ValidatorPort } from '../../orchestrator/validator.port';
import { FallbackRenderer } from '../fallback-renderer/fallback-renderer.service';
import { LAST_RESORT_TEXT } from '../fallback-renderer/fallback-copy';
import type { ProviderDispatchResult } from '../provider-gateway/provider-gateway.port';
import { ResponseValidator } from '../response-validator/response-validator.service';
import type { StoredSeverity } from '../response-validator/validation-rule.port';
import {
  summarizeViolations,
  ValidationViolation,
} from '../response-validator/validation-verdict';
import type { FallbackReason } from './rejected-candidate';
import {
  REJECTED_CANDIDATE_STORE,
  RejectedCandidateStorePort,
} from './rejected-candidate-store.port';

/**
 * What the fallback needs that a dispatch result cannot carry: which question
 * was asked, and what the deterministic engine found.
 *
 * Required by ValidatorPort so a production caller cannot silently omit the
 * engine result and make severity validation stand down. `safety` itself is
 * nullable for the real no-check case.
 */
export type FinalizeContext = GuidanceValidationContext;

/**
 * Turns a verdict into the thing a patient actually receives.
 *
 * The rule this service exists to make true: **there is no path through it
 * that returns an error or an empty answer.** A refused candidate, a provider
 * outage, an unparseable envelope and a clean generation all leave here as a
 * GuidanceResponse with text in it and a status on it. The failure modes are
 * pushed onto the paths where losing something is survivable — the rejection
 * log and the retention store, both of which are allowed to fail quietly, and
 * neither of which the patient's answer depends on.
 *
 * What the client never sees: the refused text, the violations, and whether
 * the fallback was reached through a rejection or an outage. It sees
 * validationStatus, because a client rendering a fallback should be able to
 * label it, and nothing more.
 */
@Injectable()
export class ResponseFinalizer implements ValidatorPort {
  private readonly logger = new Logger(ResponseFinalizer.name);

  constructor(
    private readonly validator: ResponseValidator,
    private readonly fallback: FallbackRenderer,
    @Inject(REJECTED_CANDIDATE_STORE)
    private readonly rejectedCandidates: RejectedCandidateStorePort,
  ) {}

  /**
   * Named to match the orchestrator's validate stage rather than to describe
   * what it does, so binding it to VALIDATOR_PORT needs no adapter class.
   */
  async validate(
    dispatch: ProviderDispatchResult,
    retrieval: RetrievalResult,
    promptVersion: string,
    context: FinalizeContext,
  ): Promise<GuidanceResponse> {
    const suppliedCitationIds = retrieval.found
      ? retrieval.chunks.map((chunk) => chunk.citationId)
      : [];

    if (dispatch.outcome === 'fallback_required') {
      // No candidate was ever produced, so there is nothing to validate and
      // nothing to review — but the patient still gets an answer, and the
      // response still carries a status.
      this.logger.warn(
        `guidance fallback: provider_unavailable (reason=${dispatch.failure?.reason ?? 'unknown'}, promptVersion=${promptVersion})`,
      );
      return this.fallbackResponse(
        'provider_unavailable',
        [],
        dispatch.text,
        suppliedCitationIds,
        promptVersion,
        context,
      );
    }

    const verdict = this.validator.validate({
      rawText: dispatch.text,
      suppliedCitationIds,
      storedSeverity: storedSeverityOf(context.safety),
    });

    if (verdict.accepted) {
      return {
        text: verdict.text,
        citationIds: verdict.citationIds,
        validationStatus: 'accepted',
        promptVersion,
      };
    }

    this.logRejection(verdict.violations, promptVersion, context);

    return this.fallbackResponse(
      'validation_rejected',
      verdict.violations,
      dispatch.text,
      suppliedCitationIds,
      promptVersion,
      context,
    );
  }

  private async fallbackResponse(
    reason: FallbackReason,
    violations: ValidationViolation[],
    candidateText: string,
    suppliedCitationIds: string[],
    promptVersion: string,
    context: FinalizeContext,
  ): Promise<GuidanceResponse> {
    const intent = context.intent;

    const rendering = this.fallback.render({
      intent,
      safety: context.safety,
    });

    await this.retain({
      patientId: context.patientId,
      intent,
      promptVersion,
      reason,
      candidateText,
      citedIds: citedIdsOf(candidateText),
      suppliedCitationIds,
      violations,
      rejectedAt: new Date().toISOString(),
    });

    return {
      // The renderer is total, so the guard below is unreachable by
      // construction. It is here anyway because "the patient never receives
      // silence" is the one promise in this story that must survive a future
      // edit to a file this service does not own.
      text: rendering.text.trim() === '' ? LAST_RESORT_TEXT : rendering.text,
      // Deliberately empty. The fallback cites nothing because it quotes
      // nothing — carrying the refused candidate's citations forward would
      // attach evidence to text that was not written from it.
      citationIds: [],
      validationStatus: 'rejected_fallback',
      promptVersion,
    };
  }

  /**
   * Retention is best-effort by design. The stores swallow their own errors;
   * this is the second net, so that a store nobody in this folder wrote still
   * cannot take an answer away from a patient.
   */
  private async retain(
    candidate: Parameters<RejectedCandidateStorePort['retain']>[0],
  ): Promise<void> {
    try {
      await this.rejectedCandidates.retain(candidate);
    } catch (error) {
      this.logger.error(
        `failed to retain a rejected candidate (reason=${candidate.reason}, intent=${candidate.intent}) — the answer was still delivered`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * One line per rejection, grouped by code so the review session starts from
   * "which rule fires most" rather than from raw text.
   *
   * Carries no patient identifier: the identifiers live on the retained
   * record, which is the thing behind an access boundary. The evidence
   * fragments are model output and safe to log — see ValidationViolation.
   */
  private logRejection(
    violations: ValidationViolation[],
    promptVersion: string,
    context: FinalizeContext,
  ): void {
    this.logger.warn(
      `guidance fallback: validation_rejected (intent=${context.intent}, promptVersion=${promptVersion}, codes=[${summarizeViolations(violations)}])`,
    );
    for (const violation of violations) {
      this.logger.debug(
        `  ${violation.rule}: ${violation.detail}${violation.evidence ? ` | ${violation.evidence}` : ''}`,
      );
    }
  }
}

/**
 * Narrows the engine's result to the two fields the severity rule compares
 * against, so the validator never holds a whole SafetyCheckResult — it has no
 * business with the patient id or the rationales on it.
 *
 * Null in, null out: a run with no check behind it has no stored severity to
 * contradict, and the rule stands down rather than guessing at one.
 */
function storedSeverityOf(
  safety: SafetyCheckSummary | null,
): StoredSeverity | null {
  if (!safety) return null;
  return {
    check: safety.severity,
    findings: safety.findings.map(({ type, severity }) => ({ type, severity })),
  };
}

/**
 * Best-effort read of what the candidate claimed to cite, for the review
 * record only.
 *
 * The candidate is unparsed here on purpose: a malformed envelope is exactly
 * the case where the citations are most interesting and least parseable. This
 * review-only extraction keeps every syntactically visible top-level or
 * claim-level citation without treating the candidate as valid. A failure to
 * read them costs a reviewer nothing — the raw text is retained beside this.
 */
function citedIdsOf(candidateText: string): string[] {
  try {
    const parsed: unknown = JSON.parse(candidateText);
    if (typeof parsed !== 'object' || parsed === null) return [];

    const envelope = parsed as {
      citationIds?: unknown;
      grounding?: unknown;
    };
    const citedIds = new Set<string>();

    addStringIds(citedIds, envelope.citationIds);
    if (Array.isArray(envelope.grounding)) {
      for (const entry of envelope.grounding) {
        if (typeof entry !== 'object' || entry === null) continue;
        addStringIds(
          citedIds,
          (entry as { citationIds?: unknown }).citationIds,
        );
      }
    }

    return [...citedIds];
  } catch {
    return [];
  }
}

function addStringIds(target: Set<string>, value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const id of value) {
    if (typeof id === 'string') target.add(id);
  }
}
