import { PipelineOrchestrator } from './pipeline-orchestrator.service';
import { IntentRegistry } from './intent-registry';
import { GuidanceIntent, GuidanceRequest, SafetyCheckSeverity } from '../contracts';
import { safetyCheckResultFixtures } from '../__fixtures__';
import { ESCALATION_DIRECTIVE } from '../escalation-directive';
import * as escalationPolicy from '../escalation-policy';
import { severityMeetsThreshold } from '../escalation-policy';

describe('PipelineOrchestrator', () => {
  const request: GuidanceRequest = {
    patientId: 1,
    intent: 'missed_dose',
    subjectMedicationId: 10,
  };
  const safety = safetyCheckResultFixtures.mixedHighestWins;

  function buildFakes() {
    return {
      scopeBuilder: {
        buildScope: jest.fn().mockResolvedValue({
          medications: [],
          conditions: [],
          allergies: [],
          safetyRunId: safety.runId,
          safetyCoverage: safety.coverage,
          safetySeverity: safety.severity,
          findings: safety.findings,
        }),
      },
      retriever: {
        retrieve: jest.fn().mockResolvedValue({ found: true, chunks: [] }),
      },
      assembler: {
        assemble: jest.fn().mockResolvedValue({
          payload: {},
          redactionSubject: {},
          promptVersion: 'v1',
        }),
      },
      providerGateway: {
        dispatch: jest.fn().mockResolvedValue({
          text: 'ok',
          redactionCount: 0,
          outcome: 'generated' as const,
        }),
      },
      validator: {
        validate: jest.fn().mockResolvedValue({
          text: 'ok',
          citationIds: [],
          validationStatus: 'accepted',
          promptVersion: 'v1',
        }),
      },
      auditHook: { record: jest.fn().mockResolvedValue(undefined) },
      fallbackRenderer: {
        render: jest.fn().mockReturnValue({
          text: 'Safety fallback.',
          severity: 'unverified',
          describedTypes: [],
        }),
      },
    };
  }

  function build(fakes: ReturnType<typeof buildFakes>) {
    return new PipelineOrchestrator(
      new IntentRegistry(),
      fakes.scopeBuilder,
      fakes.retriever,
      fakes.assembler,
      fakes.providerGateway,
      fakes.validator,
      fakes.auditHook,
      fakes.fallbackRenderer,
    );
  }

  it('runs all stages and records a success audit entry', async () => {
    const fakes = buildFakes();
    const response = await build(fakes).run(request, 'missed_dose_job');

    expect(response.validationStatus).toBe('accepted');
    expect(fakes.retriever.retrieve).toHaveBeenCalledWith({
      scope: {
        medications: [],
        conditions: [],
        allergies: [],
        safetyRunId: safety.runId,
        safetyCoverage: safety.coverage,
        safetySeverity: safety.severity,
        findings: safety.findings,
      },
      intent: request.intent,
      sections: ['dosage_and_administration', 'warnings'],
      question: request.question,
    });
    expect(fakes.validator.validate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      'v1',
      {
        intent: request.intent,
        patientId: request.patientId,
        safety: {
          runId: safety.runId,
          coverage: safety.coverage,
          severity: safety.severity,
          findings: safety.findings,
        },
      },
    );
    expect(fakes.auditHook.record).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'success',
        trigger: 'missed_dose_job',
        validationStatus: 'accepted',
      }),
    );
  });

  it('uses deterministic fallback without retrieval or a provider call when safety is incomplete', async () => {
    const fakes = buildFakes();
    fakes.scopeBuilder.buildScope.mockResolvedValue({
      medications: [],
      conditions: [],
      allergies: [],
      safetyRunId: 'no-safety-run-1',
      safetyCoverage: { status: 'partial', checks: [] },
      safetySeverity: 'unverified',
      findings: [],
      subjectMedicationId: 10,
    });

    await expect(build(fakes).run(request, 'missed_dose_job')).resolves.toEqual(
      {
        text: 'Safety fallback.',
        citationIds: [],
        validationStatus: 'rejected_fallback',
        promptVersion: 'safety-unverified-fallback-v1',
      },
    );

    expect(fakes.fallbackRenderer.render).toHaveBeenCalledWith({
      intent: 'missed_dose',
      safety: {
        runId: 'no-safety-run-1',
        coverage: { status: 'partial', checks: [] },
        severity: 'unverified',
        findings: [],
      },
    });
    expect(fakes.retriever.retrieve).not.toHaveBeenCalled();
    expect(fakes.assembler.assemble).not.toHaveBeenCalled();
    expect(fakes.providerGateway.dispatch).not.toHaveBeenCalled();
    expect(fakes.validator.validate).not.toHaveBeenCalled();
    expect(fakes.auditHook.record).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'success',
        validationStatus: 'rejected_fallback',
        promptVersion: 'safety-unverified-fallback-v1',
      }),
    );
  });

  it('converts a stage failure into a typed PipelineFailure tagged with its stage', async () => {
    const fakes = buildFakes();
    fakes.retriever.retrieve.mockRejectedValue(
      new Error('vector index unavailable'),
    );

    await expect(
      build(fakes).run(request, 'missed_dose_job'),
    ).rejects.toMatchObject({
      stage: 'retrieve',
    });
    expect(fakes.auditHook.record).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure' }),
    );
  });

  it('passes only the exact finding medication subjects into explain-finding retrieval', async () => {
    const fakes = buildFakes();
    const exactFinding = {
      ...safety.findings[0],
      id: '0f606531-c299-40dc-a2ec-f9d5f7e2e20f',
      subjectUserMedicationIds: [42, 43, 42],
    };
    fakes.scopeBuilder.buildScope.mockResolvedValue({
      medications: [],
      conditions: [],
      allergies: [],
      safetyRunId: safety.runId,
      safetyCoverage: safety.coverage,
      safetySeverity: safety.severity,
      findings: [exactFinding],
    });

    await build(fakes).run(
      {
        patientId: 1,
        intent: 'explain_finding',
        subjectSafetyCheckId: exactFinding.id,
      },
      'explain_finding_request',
    );

    expect(fakes.retriever.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'explain_finding',
        findingSubjectUserMedicationIds: [42, 43],
      }),
    );
  });

  it('rejects explain_finding without an exact selector before building scope', async () => {
    const fakes = buildFakes();

    await expect(
      build(fakes).run(
        { patientId: 1, intent: 'explain_finding' },
        'explain_finding_request',
      ),
    ).rejects.toMatchObject({ stage: 'scope' });

    expect(fakes.scopeBuilder.buildScope).not.toHaveBeenCalled();
    expect(fakes.retriever.retrieve).not.toHaveBeenCalled();
    expect(fakes.fallbackRenderer.render).not.toHaveBeenCalled();
    expect(fakes.providerGateway.dispatch).not.toHaveBeenCalled();
  });

  it('rejects a scope whose finding does not match the requested UUID', async () => {
    const fakes = buildFakes();
    fakes.scopeBuilder.buildScope.mockResolvedValue({
      medications: [],
      conditions: [],
      allergies: [],
      safetyRunId: safety.runId,
      safetyCoverage: safety.coverage,
      safetySeverity: safety.severity,
      findings: [
        {
          ...safety.findings[0],
          id: '92c26e71-73cc-42dc-bdab-7bad5babf60c',
        },
      ],
    });

    await expect(
      build(fakes).run(
        {
          patientId: 1,
          intent: 'explain_finding',
          subjectSafetyCheckId: '0f606531-c299-40dc-a2ec-f9d5f7e2e20f',
        },
        'explain_finding_request',
      ),
    ).rejects.toMatchObject({ stage: 'scope' });

    expect(fakes.retriever.retrieve).not.toHaveBeenCalled();
  });

  it('converts even an unregistered-intent failure rather than letting a raw error escape', async () => {
    const fakes = buildFakes();
    const badRequest: GuidanceRequest = {
      ...request,
      intent: 'not_a_real_intent' as GuidanceIntent,
    };

    await expect(
      build(fakes).run(badRequest, 'missed_dose_job'),
    ).rejects.toHaveProperty('stage');
  });

  describe('serious-reaction escalation wiring', () => {
    afterEach(() => jest.restoreAllMocks());

    const withSeverity = (
      fakes: ReturnType<typeof buildFakes>,
      severity: SafetyCheckSeverity,
      coverage: 'complete' | 'partial' = 'complete',
    ) => {
      fakes.scopeBuilder.buildScope.mockResolvedValue({
        medications: [],
        conditions: [],
        allergies: [],
        safetyRunId: safety.runId,
        safetyCoverage:
          coverage === 'complete'
            ? safety.coverage
            : { status: 'partial', checks: [] },
        safetySeverity: severity,
        findings: coverage === 'complete' ? safety.findings : [],
      });
    };

    it('attaches no escalation while ESCALATION_THRESHOLD is null — normal path', async () => {
      const fakes = buildFakes();
      withSeverity(fakes, 'contraindicated');

      const response = await build(fakes).run(request, 'missed_dose_job');

      expect(response.escalation).toBeUndefined();
    });

    it('attaches no escalation while ESCALATION_THRESHOLD is null — safety-incomplete fallback path', async () => {
      const fakes = buildFakes();
      withSeverity(fakes, 'contraindicated', 'partial');

      const response = await build(fakes).run(request, 'missed_dose_job');

      expect(response.escalation).toBeUndefined();
      expect(fakes.validator.validate).not.toHaveBeenCalled();
    });

    it('would attach { triggered, directive } for a hypothetical non-null threshold (real constant untouched)', async () => {
      // Drive the gate with the exported pure function against a hypothetical
      // threshold. ESCALATION_THRESHOLD is never modified.
      jest
        .spyOn(escalationPolicy, 'meetsEscalationThreshold')
        .mockImplementation((severity) =>
          severityMeetsThreshold(severity, 'minor'),
        );

      const fakes = buildFakes();
      withSeverity(fakes, 'major');

      const response = await build(fakes).run(request, 'missed_dose_job');

      expect(response.escalation).toEqual({
        triggered: true,
        directive: ESCALATION_DIRECTIVE.major,
      });
      expect(escalationPolicy.ESCALATION_THRESHOLD).toBeNull();
    });

    it('would attach on the safety-incomplete fallback path too, for a hypothetical threshold', async () => {
      jest
        .spyOn(escalationPolicy, 'meetsEscalationThreshold')
        .mockImplementation((severity) =>
          severityMeetsThreshold(severity, 'minor'),
        );

      const fakes = buildFakes();
      withSeverity(fakes, 'contraindicated', 'partial');

      const response = await build(fakes).run(request, 'missed_dose_job');

      expect(response.escalation).toEqual({
        triggered: true,
        directive: ESCALATION_DIRECTIVE.contraindicated,
      });
    });

    it("a non-clinical severity ('unverified') never escalates even under a hypothetical threshold", async () => {
      jest
        .spyOn(escalationPolicy, 'meetsEscalationThreshold')
        .mockImplementation((severity) =>
          severityMeetsThreshold(severity, 'minor'),
        );

      const fakes = buildFakes();
      withSeverity(fakes, 'unverified', 'partial');

      const response = await build(fakes).run(request, 'missed_dose_job');

      expect(response.escalation).toBeUndefined();
    });
  });
});
