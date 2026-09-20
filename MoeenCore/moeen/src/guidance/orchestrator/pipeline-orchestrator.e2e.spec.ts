import { Test } from '@nestjs/testing';
import { PipelineOrchestrator } from './pipeline-orchestrator.service';
import { IntentRegistry } from './intent-registry';
import { PATIENT_SCOPE_BUILDER_PORT, PatientScopeBuilderPort } from '../context/scope-builder/patient-scope-builder.port';
import { PatientScopeBuilder } from '../context/scope-builder/patient-scope-builder.service';
import { MockSafetyResultAdapter } from '../__fixtures__/mock-safety-result-adapter';
import { safetyCheckResultFixtures } from '../__fixtures__/safety-check-results.fixture';
import { RETRIEVER_PORT, RetrieverPort } from '../context/retriever/retriever.port';
import { MockRetrieverService } from '../__fixtures__/mock-retriever-service';
import { ASSEMBLER_PORT } from './assembler.port';
import { PROVIDER_GATEWAY_PORT } from '../generation/provider-gateway/provider-gateway.port';
import { VALIDATOR_PORT } from './validator.port';
import { AUDIT_HOOK_PORT, AuditTrigger, NoopAuditHook } from './audit-hook.port';
import { GuidanceIntent, GuidanceRequest, PatientScope } from '../contracts';
import { FALLBACK_RENDERER_PORT } from '../generation/fallback-renderer/fallback-renderer.port';
import { FallbackRenderer } from '../generation/fallback-renderer/fallback-renderer.service';

const MODERATE_INTERACTION_FINDING_ID =
  safetyCheckResultFixtures.moderateInteraction.findings[0].id!;

/**
 * Proves the orchestrator itself — stage ordering, exactly-once calls,
 * per-intent config. What's real and what's faked, stated plainly:
 *
 * - scope runs PatientScopeBuilder's real class and real query-building
 *   logic, constructed directly rather than through PatientScopeBuilderModule
 *   — that module's DI pulls in a live DRIZZLE connection and the currently-
 *   throwing SafetyEngineRepository (SafetyEngineRepository.findActiveWarningsForPatient
 *   / findWarningById both throw 'wire to real schema once migrated'; bug
 *   filed). Findings come from the team's official MockSafetyResultAdapter
 *   fixture instead, same pattern patient-scope-builder.service.spec.ts
 *   already uses, not a new one. Instrumented via jest.spyOn on the real
 *   instance (call-through to the original implementation), same as
 *   retrieve below, so its real ordering and output are both provable here.
 * - retrieve uses the team's official published MockRetrieverService
 *   fixture, not RetrieverService's real query. RetrieverModule has its own
 *   separate DatabaseModule wiring gap — RetrieverModule/LabelProcessingModule
 *   never import DatabaseModule directly, only worked before because
 *   PatientScopeBuilderModule's transitive, @Global() DatabaseModule import
 *   incidentally supplied DRIZZLE for the whole test graph; removing that
 *   module exposed it. Same shape as ProviderGatewayModule's ConfigModule
 *   gap, flagged to Islam. Pulling a live DB into this test isn't
 *   appropriate regardless of that gap.
 * - assemble, call, and validate are local test fakes recording call order —
 *   assemble because GN-1's real assembler isn't wired to ASSEMBLER_PORT yet,
 *   call because ProviderGatewayModule has its own unrelated ConfigModule gap
 *   (GenerationConfig needs ConfigService, the module doesn't import
 *   ConfigModule — flagged to Alaa, not this task's to fix), validate because
 *   GN-3 isn't merged.
 */
describe('PipelineOrchestrator — end to end on real fakes, per intent', () => {
  const callOrder: string[] = [];

  function createChain(resolvedValue: unknown) {
    const chain: Record<string, jest.Mock> = {};
    for (const method of ['from', 'innerJoin', 'leftJoin', 'where']) {
      chain[method] =
        method === 'where'
          ? jest.fn().mockResolvedValue(resolvedValue)
          : jest.fn().mockReturnValue(chain);
    }
    return chain;
  }

  // Same idiom as patient-scope-builder.service.spec.ts's mockDb: one
  // realistic medication row, empty conditions/allergies. select() is
  // called three times per buildScope call (medications, conditions,
  // allergies), in that fixed order.
  function buildMockDb() {
    return {
      select: jest
        .fn()
        .mockReturnValueOnce(
          createChain([
            {
              userMedicationId: 10,
              genericName: 'lisinopril',
              frequency: 1,
              time: '08:00:00',
            },
          ]),
        )
        .mockReturnValueOnce(createChain([]))
        .mockReturnValueOnce(createChain([])),
    };
  }

  function buildAssemblerFake() {
    return {
      assemble: jest.fn(async () => {
        callOrder.push('assemble');
        return { payload: { text: 'assembled' }, redactionSubject: {}, promptVersion: 'e2e-v1' };
      }),
    };
  }

  function buildProviderGatewayFake() {
    return {
      dispatch: jest.fn(async () => {
        callOrder.push('call');
        return { text: 'raw model output', redactionCount: 0, outcome: 'generated' as const };
      }),
    };
  }

  function buildValidatorFake() {
    return {
      validate: jest.fn(async () => {
        callOrder.push('validate');
        return { text: 'ok', citationIds: [], validationStatus: 'accepted' as const, promptVersion: 'e2e-v1' };
      }),
    };
  }

  async function buildOrchestrator() {
    callOrder.length = 0;
    const captured: { scope?: PatientScope } = {};

    const safetyResultAdapter = new MockSafetyResultAdapter();
    // Registered unconditionally; only the explain_finding case's
    // subjectSafetyCheckId actually resolves it through getById. The other
    // two intents go through getLatestForPatient instead, which returns the
    // adapter's default (safetyCheckResultFixtures.clear) regardless.
    safetyResultAdapter.registerById(
      MODERATE_INTERACTION_FINDING_ID,
      safetyCheckResultFixtures.moderateInteraction,
    );

    const mockDb = buildMockDb();

    const moduleRef = await Test.createTestingModule({
      providers: [
        IntentRegistry,
        PipelineOrchestrator,
        {
          provide: PATIENT_SCOPE_BUILDER_PORT,
          useFactory: () => new PatientScopeBuilder(mockDb as never, safetyResultAdapter),
        },
        { provide: RETRIEVER_PORT, useClass: MockRetrieverService },
        { provide: ASSEMBLER_PORT, useValue: buildAssemblerFake() },
        { provide: PROVIDER_GATEWAY_PORT, useValue: buildProviderGatewayFake() },
        { provide: VALIDATOR_PORT, useValue: buildValidatorFake() },
        { provide: AUDIT_HOOK_PORT, useClass: NoopAuditHook },
        { provide: FALLBACK_RENDERER_PORT, useClass: FallbackRenderer },
      ],
    }).compile();

    // scope and retrieve are the two real (non-faked) stages — spy on the
    // real instances Nest actually constructed, call through to the
    // original implementation, and record both call order and (for scope)
    // the resolved value, so this test proves what they did, not just that
    // they didn't throw.
    const scopeBuilder = moduleRef.get<PatientScopeBuilderPort>(PATIENT_SCOPE_BUILDER_PORT);
    const originalBuildScope = scopeBuilder.buildScope.bind(scopeBuilder);
    jest.spyOn(scopeBuilder, 'buildScope').mockImplementation(async (...args) => {
      callOrder.push('scope');
      const scope = await originalBuildScope(...args);
      captured.scope = scope;
      return scope;
    });

    const retriever = moduleRef.get<RetrieverPort>(RETRIEVER_PORT);
    const originalRetrieve = retriever.retrieve.bind(retriever);
    jest.spyOn(retriever, 'retrieve').mockImplementation(async (...args) => {
      callOrder.push('retrieve');
      return originalRetrieve(...args);
    });

    return { orchestrator: moduleRef.get(PipelineOrchestrator), captured };
  }

  const cases: { intent: GuidanceIntent; trigger: AuditTrigger; request: GuidanceRequest }[] = [
    {
      intent: 'missed_dose',
      trigger: 'missed_dose_job',
      request: { patientId: 1, intent: 'missed_dose', subjectMedicationId: 10 },
    },
    {
      intent: 'explain_finding',
      trigger: 'explain_finding_request',
      // patientId matches safetyCheckResultFixtures.moderateInteraction's own
      // patientId — PatientScopeBuilder.loadFindings throws if the resolved
      // check's patientId doesn't match the request's.
      request: {
        patientId: safetyCheckResultFixtures.moderateInteraction.patientId,
        intent: 'explain_finding',
        subjectSafetyCheckId: MODERATE_INTERACTION_FINDING_ID,
      },
    },
    {
      intent: 'medication_question',
      trigger: 'patient_chat',
      request: { patientId: 1, intent: 'medication_question', subjectMedicationId: 10, question: 'What is this for?' },
    },
  ];

  it.each(cases)('runs $intent end to end, stages called in order, each exactly once', async ({ intent, trigger, request }) => {
    const { orchestrator, captured } = await buildOrchestrator();

    const response = await orchestrator.run(request, trigger);

    expect(response.validationStatus).toBe('accepted');
    expect(callOrder).toEqual(['scope', 'retrieve', 'assemble', 'call', 'validate']);

    if (intent === 'explain_finding') {
      // Proves buildScope() actually resolved the selected finding UUID
      // through SafetyResultPort.getById, not the adapter's default
      // getLatestForPatient result (safetyCheckResultFixtures.clear) — the
      // built scope must carry moderateInteraction's findings specifically.
      expect(captured.scope?.findings).toEqual(
        safetyCheckResultFixtures.moderateInteraction.findings,
      );
    }
  });
});
