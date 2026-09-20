import { Inject, Injectable } from '@nestjs/common';
import {
  GuidanceEscalation,
  GuidanceRequest,
  GuidanceResponse,
  PatientScope,
  SafetyCheckSeverity,
} from '../contracts';
import { ESCALATION_DIRECTIVE } from '../escalation-directive';
import { meetsEscalationThreshold } from '../escalation-policy';
import { IntentRegistry } from './intent-registry';
import {
  runStage,
  toPipelineFailure,
  isPipelineFailure,
} from './pipeline-failure';
import {
  AuditHookPort,
  AUDIT_HOOK_PORT,
  AuditTrigger,
} from './audit-hook.port';
import {
  PatientScopeBuilderPort,
  PATIENT_SCOPE_BUILDER_PORT,
} from '../context/scope-builder/patient-scope-builder.port';
import {
  RetrieverPort,
  RETRIEVER_PORT,
} from '../context/retriever/retriever.port';
import { AssemblerPort, ASSEMBLER_PORT } from './assembler.port';
import { ValidatorPort, VALIDATOR_PORT } from './validator.port';
import {
  ProviderGatewayPort,
  PROVIDER_GATEWAY_PORT,
} from '../generation/provider-gateway/provider-gateway.port';
import {
  FALLBACK_RENDERER_PORT,
  FallbackRendererPort,
} from '../generation/fallback-renderer/fallback-renderer.port';

const UNVERIFIED_FALLBACK_VERSION = 'safety-unverified-fallback-v1';

@Injectable()
export class PipelineOrchestrator {
  constructor(
    private readonly intentRegistry: IntentRegistry,
    @Inject(PATIENT_SCOPE_BUILDER_PORT)
    private readonly scopeBuilder: PatientScopeBuilderPort,
    @Inject(RETRIEVER_PORT) private readonly retriever: RetrieverPort,
    @Inject(ASSEMBLER_PORT) private readonly assembler: AssemblerPort,
    @Inject(PROVIDER_GATEWAY_PORT)
    private readonly providerGateway: ProviderGatewayPort,
    @Inject(VALIDATOR_PORT) private readonly validator: ValidatorPort,
    @Inject(AUDIT_HOOK_PORT) private readonly auditHook: AuditHookPort,
    @Inject(FALLBACK_RENDERER_PORT)
    private readonly fallbackRenderer: FallbackRendererPort,
  ) {}

  async run(
    request: GuidanceRequest,
    trigger: AuditTrigger,
  ): Promise<GuidanceResponse> {
    try {
      this.assertFindingSelector(request);
      const intentConfig = this.intentRegistry.get(request.intent);

      const scope = await runStage('scope', () =>
        this.scopeBuilder.buildScope({
          patientId: request.patientId,
          safetyRunId: request.safetyRunId,
          subjectMedicationId: request.subjectMedicationId,
          subjectSafetyCheckId: request.subjectSafetyCheckId,
        }),
      );
      const findingSubjectUserMedicationIds =
        request.intent === 'explain_finding'
          ? this.findingSubjectUserMedicationIds(
              request.subjectSafetyCheckId,
              scope.findings,
            )
          : [];

      // The severity is already resolved by the safety engine
      // (scope.safetySeverity). Gate is inert while ESCALATION_THRESHOLD is null
      // — resolveEscalation returns undefined in that case, so nothing is
      // attached to any response today.
      const escalation = this.resolveEscalation(scope.safetySeverity);

      if (scope.safetyCoverage.status !== 'complete') {
        const rendering = this.fallbackRenderer.render({
          intent: request.intent,
          safety: {
            runId: scope.safetyRunId,
            coverage: scope.safetyCoverage,
            severity: scope.safetySeverity,
            findings: scope.findings,
          },
        });
        const response: GuidanceResponse = {
          text: rendering.text,
          citationIds: [],
          validationStatus: 'rejected_fallback',
          promptVersion: UNVERIFIED_FALLBACK_VERSION,
          ...(escalation ? { escalation } : {}),
        };
        await this.auditHook.record({
          request,
          trigger,
          outcome: 'success',
          promptVersion: response.promptVersion,
          citationIds: [],
          validationStatus: response.validationStatus,
        });
        return response;
      }

      const retrieval = await runStage('retrieve', () => {
        if (request.intent === 'explain_finding') {
          return this.retriever.retrieve({
            scope,
            intent: 'explain_finding',
            sections: intentConfig.retrievalSections,
            question: request.question,
            findingSubjectUserMedicationIds,
          });
        }

        return this.retriever.retrieve({
          scope,
          intent: request.intent,
          sections: intentConfig.retrievalSections,
          question: request.question,
        });
      });
      const assembled = await runStage('assemble', () =>
        this.assembler.assemble(scope, retrieval, request),
      );
      const dispatch = await runStage('call', () =>
        this.providerGateway.dispatch(
          assembled.payload,
          assembled.redactionSubject,
        ),
      );
      const validated = await runStage('validate', () =>
        this.validator.validate(dispatch, retrieval, assembled.promptVersion, {
          intent: request.intent,
          patientId: request.patientId,
          safety: {
            runId: scope.safetyRunId,
            coverage: scope.safetyCoverage,
            severity: scope.safetySeverity,
            findings: scope.findings,
          },
        }),
      );
      const response: GuidanceResponse = escalation
        ? { ...validated, escalation }
        : validated;

      await this.auditHook.record({
        request,
        trigger,
        outcome: 'success',
        promptVersion: response.promptVersion,
        citationIds: response.citationIds,
        validationStatus: response.validationStatus,
      });
      return response;
    } catch (error) {
      const failure = isPipelineFailure(error)
        ? error
        : toPipelineFailure('scope', error);
      await this.auditHook.record({
        request,
        trigger,
        outcome: 'failure',
        failure,
      });
      // PipelineFailure is the established cross-layer failure contract and
      // is intentionally a plain typed value rather than an Error subclass.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw failure;
    }
  }

  /**
   * Serious-reaction escalation connection point. Returns the escalation payload
   * only when the already-resolved safety severity meets ESCALATION_THRESHOLD
   * (src/guidance/escalation-policy.ts). That threshold is null today, so this
   * always returns undefined — the code path is real, the gate is closed.
   * `directive` is the fixed, non-generated ESCALATION_DIRECTIVE text.
   */
  private resolveEscalation(
    severity: SafetyCheckSeverity,
  ): GuidanceEscalation | undefined {
    if (!meetsEscalationThreshold(severity)) {
      return undefined;
    }

    return { triggered: true, directive: ESCALATION_DIRECTIVE[severity] };
  }

  private findingSubjectUserMedicationIds(
    findingId: string | undefined,
    findings: PatientScope['findings'],
  ): number[] {
    if (!findingId || findings.length !== 1) {
      throw new Error(
        'explain_finding retrieval requires one exact safety finding',
      );
    }

    const finding = findings[0];
    if (finding.id !== findingId) {
      throw new Error(
        `Safety finding "${finding.id}" does not match requested finding "${findingId}"`,
      );
    }

    return [...new Set(finding.subjectUserMedicationIds)];
  }

  private assertFindingSelector(request: GuidanceRequest): void {
    if (request.intent === 'explain_finding' && !request.subjectSafetyCheckId) {
      throw new Error(
        'explain_finding requires an immutable safety finding UUID',
      );
    }
    if (
      request.intent !== 'explain_finding' &&
      request.subjectSafetyCheckId !== undefined
    ) {
      throw new Error(
        'subjectSafetyCheckId is only valid for explain_finding requests',
      );
    }
  }
}
