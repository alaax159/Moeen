import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import {
  SafetyCheckResult,
  SafetyFindingSeverity,
  ValidationStatus,
} from '../../contracts';
import {
  FALLBACK_RENDERER_PORT,
  FallbackRendererPort,
} from '../../generation/fallback-renderer/fallback-renderer.port';
import {
  SAFETY_RESULT_PORT,
  SafetyResultPort,
} from '../../adapters/safety-result-adapter/safety-result-adapter.port';
import { isPipelineFailure } from '../../orchestrator/pipeline-failure';
import { PipelineOrchestrator } from '../../orchestrator/pipeline-orchestrator.service';
import {
  CitationResolver,
  ResolvedCitation,
} from './citation-resolver.service';
import { findingHash } from './finding-hash';
import { FindingExplanationCacheRepository } from './finding-explanation-cache.repository';
import { severityLanguageIsConsistent } from './severity-language-guard';

export interface ExplanationDto {
  text: string;
  citations: ResolvedCitation[];
  severity: SafetyFindingSeverity;
  validationStatus: ValidationStatus;
  cached: boolean;
}

@Injectable()
export class GetExplanationService {
  private readonly logger = new Logger(GetExplanationService.name);
  private readonly inFlight = new Map<string, Promise<ExplanationDto>>();

  constructor(
    @Inject(SAFETY_RESULT_PORT)
    private readonly safetyResultPort: SafetyResultPort,
    private readonly orchestrator: PipelineOrchestrator,
    private readonly cache: FindingExplanationCacheRepository,
    private readonly citationResolver: CitationResolver,
    @Inject(FALLBACK_RENDERER_PORT)
    private readonly fallbackRenderer: FallbackRendererPort,
  ) {}

  async getExplanation(
    findingId: string | number,
    patientId: number,
  ): Promise<ExplanationDto> {
    const normalizedFindingId = String(findingId);
    const check = await this.safetyResultPort.getFindingById(
      normalizedFindingId,
      patientId,
    );

    // Same 404 whether the id doesn't exist at all or belongs to another
    // patient — distinguishing the two would confirm to a caller that a
    // given findingId exists for someone else, which is itself a leak.
    if (!check || check.findings.length === 0) {
      throw new NotFoundException('No safety check found for this id');
    }

    // getFindingById is required to narrow the result to exactly one finding.
    const finding = check.findings[0];
    const hash = findingHash(check, finding);

    const cached = await this.findAcceptedCache(hash, normalizedFindingId);
    if (cached) {
      const citations = await this.resolveCitations(cached.citations);
      return {
        text: cached.text,
        citations,
        severity: finding.severity,
        validationStatus: cached.validationStatus,
        cached: true,
      };
    }

    const running = this.inFlight.get(hash);
    if (running) return running;

    const generation = this.generate(
      hash,
      normalizedFindingId,
      patientId,
      check,
    );
    this.inFlight.set(hash, generation);

    try {
      return await generation;
    } finally {
      if (this.inFlight.get(hash) === generation) this.inFlight.delete(hash);
    }
  }

  private async generate(
    hash: string,
    findingId: string,
    patientId: number,
    check: SafetyCheckResult,
  ): Promise<ExplanationDto> {
    const finding = check.findings[0];
    let text: string;
    let citationIds: string[];
    let validationStatus: ValidationStatus;

    try {
      const response = await this.orchestrator.run(
        {
          patientId,
          intent: 'explain_finding',
          subjectSafetyCheckId: findingId,
        },
        'explain_finding_request',
      );
      text = response.text;
      citationIds = response.citationIds;
      validationStatus = response.validationStatus;
    } catch (error) {
      if (isPipelineFailure(error)) {
        this.logger.error(
          `explain_finding pipeline failed at stage "${error.stage}" for findingId ${findingId}: ${error.message}`,
        );
        text = this.renderFallback(check);
        citationIds = [];
        validationStatus = 'rejected_fallback';
      } else {
        throw error;
      }
    }

    // Second, independent check on top of whatever upstream validation did
    // (or didn't) catch — see severity-language-guard.ts for why this
    // exists as its own layer rather than trusting the pipeline alone.
    if (
      validationStatus === 'accepted' &&
      !severityLanguageIsConsistent(text, finding.severity)
    ) {
      this.logger.warn(
        `Generated explanation for findingId ${findingId} failed the severity-language guard — falling back to deterministic text`,
      );
      text = this.renderFallback(check);
      citationIds = [];
      validationStatus = 'rejected_fallback';
    }

    if (validationStatus === 'accepted') {
      await this.saveToCache(hash, findingId, {
        text,
        citations: citationIds,
        validationStatus,
      });
    }

    const citations = await this.resolveCitations(citationIds);

    return {
      text,
      citations,
      severity: finding.severity,
      validationStatus,
      cached: false,
    };
  }

  private renderFallback(check: SafetyCheckResult): string {
    return this.fallbackRenderer.render({
      intent: 'explain_finding',
      safety: {
        runId: check.runId,
        coverage: check.coverage,
        severity: check.severity,
        findings: check.findings,
      },
    }).text;
  }

  /** Cache availability never controls explanation availability. */
  private async findAcceptedCache(
    hash: string,
    findingId: string,
  ): Promise<
    Awaited<ReturnType<FindingExplanationCacheRepository['findByHash']>>
  > {
    try {
      const cached = await this.cache.findByHash(hash);
      // Older deployments persisted fallbacks. They were safe for the
      // original request, but must not become every later retry's response.
      return cached?.validationStatus === 'accepted' ? cached : null;
    } catch (error) {
      this.logger.error(
        `Failed to read the explanation cache for findingId ${findingId} — generating a fresh answer`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  /**
   * Best-effort. Only accepted responses reach this method. A cache write
   * failing must never take away an answer that was already correctly
   * generated and guard-checked — the cost is the next identical request
   * regenerating instead of hitting the cache.
   */
  private async saveToCache(
    hash: string,
    findingId: string,
    explanation: Parameters<FindingExplanationCacheRepository['save']>[1],
  ): Promise<void> {
    try {
      await this.cache.save(hash, explanation);
    } catch (error) {
      this.logger.error(
        `Failed to cache the explanation for findingId ${findingId} — the answer was still returned`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Best-effort, same reasoning as saveToCache: citations are supplementary
   * to the answer, not the answer itself. A lookup failure here must not
   * cost the patient a correct, already-generated explanation.
   */
  private async resolveCitations(
    citationIds: string[],
  ): Promise<ResolvedCitation[]> {
    try {
      return await this.citationResolver.resolve(citationIds);
    } catch (error) {
      this.logger.error(
        'Failed to resolve citations for an explanation — returning it without citations',
        error instanceof Error ? error.stack : String(error),
      );
      return [];
    }
  }
}
