import { NotFoundException } from '@nestjs/common';

import { MockSafetyResultAdapter } from '../../__fixtures__/mock-safety-result-adapter';
import { safetyCheckResultFixtures } from '../../__fixtures__/safety-check-results.fixture';
import {
  DECISION_LINE,
  FINDING_COPY,
} from '../../generation/fallback-renderer/fallback-copy';
import { FallbackRenderer } from '../../generation/fallback-renderer/fallback-renderer.service';
import { GetExplanationService } from './get-explanation.service';
import { findingHash } from './finding-hash';

function mockOrchestrator(run: jest.Mock) {
  return { run } as never;
}

function mockCache() {
  return {
    findByHash: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function mockCitationResolver() {
  return {
    resolve: jest.fn().mockImplementation((ids: string[]) =>
      Promise.resolve(
        ids.map((citationId) => ({
          citationId,
          setId: 'setid-x',
          section: 'warnings',
        })),
      ),
    ),
  };
}

function createService(
  safetyResultPort: MockSafetyResultAdapter,
  orchestrator: never,
  cache: never,
  citationResolver: never,
  fallbackRenderer = new FallbackRenderer(),
) {
  return new GetExplanationService(
    safetyResultPort,
    orchestrator,
    cache,
    citationResolver,
    fallbackRenderer,
  );
}

describe('GetExplanationService', () => {
  let safetyResultPort: MockSafetyResultAdapter;

  beforeEach(() => {
    safetyResultPort = new MockSafetyResultAdapter();
  });

  describe('lookup and ownership', () => {
    it('throws 404 when no safety check exists for the given id', async () => {
      const findingSpy = jest.spyOn(safetyResultPort, 'getFindingById');
      const service = createService(
        safetyResultPort,
        mockOrchestrator(jest.fn()),
        mockCache() as never,
        mockCitationResolver() as never,
      );

      await expect(service.getExplanation(999, 42)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(findingSpy).toHaveBeenCalledWith('999', 42);
    });

    it('throws 404, not a different error, when the check belongs to another patient', async () => {
      safetyResultPort.registerById(
        7,
        safetyCheckResultFixtures.majorAllergyConflict,
      ); // patientId 1003
      const service = createService(
        safetyResultPort,
        mockOrchestrator(jest.fn()),
        mockCache() as never,
        mockCitationResolver() as never,
      );

      await expect(service.getExplanation(7, 42)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('caching', () => {
    it('returns the cached explanation and never calls the orchestrator on a cache hit', async () => {
      const check = safetyCheckResultFixtures.majorAllergyConflict;
      safetyResultPort.registerById(7, check);
      const run = jest.fn();
      const cache = mockCache();
      cache.findByHash.mockResolvedValue({
        text: 'Cached explanation.',
        citations: ['label-chunk-1'],
        validationStatus: 'accepted',
      });
      const service = createService(
        safetyResultPort,
        mockOrchestrator(run),
        cache as never,
        mockCitationResolver() as never,
      );

      const result = await service.getExplanation(7, check.patientId);

      expect(result.text).toBe('Cached explanation.');
      expect(result.cached).toBe(true);
      expect(run).not.toHaveBeenCalled();
    });

    it('looks up the cache by the finding content hash', async () => {
      const check = safetyCheckResultFixtures.majorAllergyConflict;
      safetyResultPort.registerById(7, check);
      const cache = mockCache();
      const service = createService(
        safetyResultPort,
        mockOrchestrator(
          jest.fn().mockResolvedValue({
            text: 'Fresh explanation with significant risk noted.',
            citationIds: [],
            validationStatus: 'accepted',
            promptVersion: 'v1',
          }),
        ),
        cache as never,
        mockCitationResolver() as never,
      );

      await service.getExplanation(7, check.patientId);

      expect(cache.findByHash).toHaveBeenCalledWith(
        findingHash(check, check.findings[0]),
      );
    });

    it('saves a fresh explanation to the cache after generating it', async () => {
      const check = safetyCheckResultFixtures.majorAllergyConflict;
      safetyResultPort.registerById(7, check);
      const cache = mockCache();
      const service = createService(
        safetyResultPort,
        mockOrchestrator(
          jest.fn().mockResolvedValue({
            text: 'Fresh explanation with significant risk noted.',
            citationIds: ['label-chunk-1'],
            validationStatus: 'accepted',
            promptVersion: 'v1',
          }),
        ),
        cache as never,
        mockCitationResolver() as never,
      );

      await service.getExplanation(7, check.patientId);

      expect(cache.save).toHaveBeenCalledWith(
        findingHash(check, check.findings[0]),
        expect.objectContaining({
          text: 'Fresh explanation with significant risk noted.',
          citations: ['label-chunk-1'],
          validationStatus: 'accepted',
        }),
      );
    });

    it('ignores a legacy cached fallback so a later request can try generation again', async () => {
      const check = safetyCheckResultFixtures.majorAllergyConflict;
      safetyResultPort.registerById(7, check);
      const cache = mockCache();
      cache.findByHash.mockResolvedValue({
        text: 'Old deterministic fallback.',
        citations: [],
        validationStatus: 'rejected_fallback',
      });
      const run = jest.fn().mockResolvedValue({
        text: 'Fresh explanation with significant risk noted.',
        citationIds: [],
        validationStatus: 'accepted',
        promptVersion: 'v1',
      });
      const service = createService(
        safetyResultPort,
        mockOrchestrator(run),
        cache as never,
        mockCitationResolver() as never,
      );

      const result = await service.getExplanation(7, check.patientId);

      expect(run).toHaveBeenCalledTimes(1);
      expect(result.cached).toBe(false);
      expect(result.text).toBe(
        'Fresh explanation with significant risk noted.',
      );
    });

    it('collapses concurrent cache misses into one model generation', async () => {
      const check = safetyCheckResultFixtures.majorAllergyConflict;
      safetyResultPort.registerById(7, check);
      let resolveGeneration!: (value: {
        text: string;
        citationIds: string[];
        validationStatus: 'accepted';
        promptVersion: string;
      }) => void;
      const run = jest.fn(
        () =>
          new Promise<{
            text: string;
            citationIds: string[];
            validationStatus: 'accepted';
            promptVersion: string;
          }>((resolve) => {
            resolveGeneration = resolve;
          }),
      );
      const service = createService(
        safetyResultPort,
        mockOrchestrator(run),
        mockCache() as never,
        mockCitationResolver() as never,
      );

      const first = service.getExplanation(7, check.patientId);
      const second = service.getExplanation(7, check.patientId);
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(run).toHaveBeenCalledTimes(1);
      resolveGeneration({
        text: 'Fresh explanation with significant risk noted.',
        citationIds: [],
        validationStatus: 'accepted',
        promptVersion: 'v1',
      });

      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(firstResult).toEqual(secondResult);
    });

    it('does not cache a rejected fallback as if a transient failure were permanent', async () => {
      const check = safetyCheckResultFixtures.majorAllergyConflict;
      safetyResultPort.registerById(7, check);
      const cache = mockCache();
      const run = jest.fn().mockResolvedValue({
        text: 'Deterministic fallback text.',
        citationIds: [],
        validationStatus: 'rejected_fallback',
        promptVersion: 'v1',
      });
      const service = createService(
        safetyResultPort,
        mockOrchestrator(run),
        cache as never,
        mockCitationResolver() as never,
      );

      await service.getExplanation(7, check.patientId);
      await service.getExplanation(7, check.patientId);

      expect(run).toHaveBeenCalledTimes(2);
      expect(cache.save).not.toHaveBeenCalled();
    });
  });

  describe('calling the orchestrator', () => {
    it('calls run() with intent explain_finding and the warning id as subjectSafetyCheckId', async () => {
      const check = safetyCheckResultFixtures.majorAllergyConflict;
      safetyResultPort.registerById(7, check);
      const run = jest.fn().mockResolvedValue({
        text: 'Fresh explanation with significant risk noted.',
        citationIds: [],
        validationStatus: 'accepted',
        promptVersion: 'v1',
      });
      const service = createService(
        safetyResultPort,
        mockOrchestrator(run),
        mockCache() as never,
        mockCitationResolver() as never,
      );

      await service.getExplanation(7, check.patientId);

      expect(run).toHaveBeenCalledWith(
        {
          patientId: check.patientId,
          intent: 'explain_finding',
          subjectSafetyCheckId: '7',
        },
        'explain_finding_request',
      );
    });

    it('returns deterministic text when a pipeline stage fails', async () => {
      const check = safetyCheckResultFixtures.majorAllergyConflict;
      safetyResultPort.registerById(7, check);
      const cache = mockCache();
      const run = jest.fn().mockRejectedValue({
        stage: 'call',
        message: 'provider timeout',
        cause: new Error('timeout'),
      });
      const fallbackRenderer = new FallbackRenderer();
      const renderSpy = jest.spyOn(fallbackRenderer, 'render');
      const service = createService(
        safetyResultPort,
        mockOrchestrator(run),
        cache as never,
        mockCitationResolver() as never,
        fallbackRenderer,
      );

      const result = await service.getExplanation(7, check.patientId);

      expect(result.validationStatus).toBe('rejected_fallback');
      expect(result.text).toContain(FINDING_COPY.allergy_conflict);
      expect(result.text).toContain(DECISION_LINE);
      expect(result.text).not.toContain(check.findings[0].rationale);
      expect(result.citations).toEqual([]);
      expect(cache.save).not.toHaveBeenCalled();
      expect(renderSpy).toHaveBeenCalledWith({
        intent: 'explain_finding',
        safety: {
          runId: check.runId,
          coverage: check.coverage,
          severity: check.severity,
          findings: check.findings,
        },
      });
    });
  });

  describe('the severity-language guard — the core safety property this story exists for', () => {
    it('lets consistent language through unchanged for a major finding', async () => {
      const check = safetyCheckResultFixtures.majorAllergyConflict;
      safetyResultPort.registerById(7, check);
      const service = createService(
        safetyResultPort,
        mockOrchestrator(
          jest.fn().mockResolvedValue({
            text: 'This is a significant allergy conflict and should be reviewed with your doctor.',
            citationIds: ['label-chunk-1'],
            validationStatus: 'accepted',
            promptVersion: 'v1',
          }),
        ),
        mockCache() as never,
        mockCitationResolver() as never,
      );

      const result = await service.getExplanation(7, check.patientId);

      expect(result.validationStatus).toBe('accepted');
      expect(result.text).toContain('significant allergy conflict');
    });

    it('catches a softened major finding that upstream validation accepted, and replaces it with the deterministic fallback', async () => {
      const check = safetyCheckResultFixtures.majorAllergyConflict;
      safetyResultPort.registerById(7, check);
      const service = createService(
        safetyResultPort,
        mockOrchestrator(
          jest.fn().mockResolvedValue({
            // A softened major alert — exactly the failure DL-3 exists to prevent.
            text: 'This is nothing to worry about, no need to see a doctor.',
            citationIds: ['label-chunk-1'],
            validationStatus: 'accepted',
            promptVersion: 'v1',
          }),
        ),
        mockCache() as never,
        mockCitationResolver() as never,
      );

      const result = await service.getExplanation(7, check.patientId);

      expect(result.validationStatus).toBe('rejected_fallback');
      expect(result.text).not.toMatch(/nothing to worry about/i);
      expect(result.text).toContain(FINDING_COPY.allergy_conflict);
      expect(result.text).toContain(DECISION_LINE);
      expect(result.text).not.toContain(check.findings[0].rationale);
      expect(result.citations).toEqual([]);
    });

    it('does not apply the escalation check to a major finding (direction-specific)', async () => {
      const check = safetyCheckResultFixtures.majorAllergyConflict;
      safetyResultPort.registerById(7, check);
      const service = createService(
        safetyResultPort,
        mockOrchestrator(
          jest.fn().mockResolvedValue({
            text: 'This is an emergency, call 911 immediately.',
            citationIds: [],
            validationStatus: 'accepted',
            promptVersion: 'v1',
          }),
        ),
        mockCache() as never,
        mockCitationResolver() as never,
      );

      const result = await service.getExplanation(7, check.patientId);

      // Escalating language isn't the failure mode this guard targets for
      // a major finding — only minimizing language is.
      expect(result.validationStatus).toBe('accepted');
    });

    it('passes an already-rejected response straight through without re-checking language', async () => {
      const check = safetyCheckResultFixtures.majorAllergyConflict;
      safetyResultPort.registerById(7, check);
      const service = createService(
        safetyResultPort,
        mockOrchestrator(
          jest.fn().mockResolvedValue({
            text: 'Deterministic fallback text from the validator itself.',
            citationIds: [],
            validationStatus: 'rejected_fallback',
            promptVersion: 'v1',
          }),
        ),
        mockCache() as never,
        mockCitationResolver() as never,
      );

      const result = await service.getExplanation(7, check.patientId);

      expect(result.validationStatus).toBe('rejected_fallback');
      expect(result.text).toBe(
        'Deterministic fallback text from the validator itself.',
      );
    });
  });

  describe('citations', () => {
    it('resolves citation ids through CitationResolver before returning', async () => {
      const check = safetyCheckResultFixtures.majorAllergyConflict;
      safetyResultPort.registerById(7, check);
      const citationResolver = mockCitationResolver();
      const service = createService(
        safetyResultPort,
        mockOrchestrator(
          jest.fn().mockResolvedValue({
            text: 'Fresh explanation with significant risk noted.',
            citationIds: ['label-chunk-1', 'label-chunk-2'],
            validationStatus: 'accepted',
            promptVersion: 'v1',
          }),
        ),
        mockCache() as never,
        citationResolver as never,
      );

      const result = await service.getExplanation(7, check.patientId);

      expect(citationResolver.resolve).toHaveBeenCalledWith([
        'label-chunk-1',
        'label-chunk-2',
      ]);
      expect(result.citations).toEqual([
        { citationId: 'label-chunk-1', setId: 'setid-x', section: 'warnings' },
        { citationId: 'label-chunk-2', setId: 'setid-x', section: 'warnings' },
      ]);
    });
  });

  describe('caching and citation lookups are best-effort — a failure there must not cost the patient an already-generated answer', () => {
    it('generates a fresh explanation when the cache read fails', async () => {
      const check = safetyCheckResultFixtures.majorAllergyConflict;
      safetyResultPort.registerById(7, check);
      const cache = mockCache();
      cache.findByHash.mockRejectedValue(new Error('cache unavailable'));
      const run = jest.fn().mockResolvedValue({
        text: 'Fresh explanation with significant risk noted.',
        citationIds: [],
        validationStatus: 'accepted',
        promptVersion: 'v1',
      });
      const service = createService(
        safetyResultPort,
        mockOrchestrator(run),
        cache as never,
        mockCitationResolver() as never,
      );

      const result = await service.getExplanation(7, check.patientId);

      expect(result.text).toBe(
        'Fresh explanation with significant risk noted.',
      );
      expect(run).toHaveBeenCalledTimes(1);
      expect(cache.save).toHaveBeenCalledTimes(1);
    });

    it('still returns the generated explanation when the cache write fails', async () => {
      const check = safetyCheckResultFixtures.majorAllergyConflict;
      safetyResultPort.registerById(7, check);
      const cache = mockCache();
      cache.save.mockRejectedValue(new Error('connection reset'));
      const service = createService(
        safetyResultPort,
        mockOrchestrator(
          jest.fn().mockResolvedValue({
            text: 'Fresh explanation with significant risk noted.',
            citationIds: [],
            validationStatus: 'accepted',
            promptVersion: 'v1',
          }),
        ),
        cache as never,
        mockCitationResolver() as never,
      );

      const result = await service.getExplanation(7, check.patientId);

      expect(result.text).toBe(
        'Fresh explanation with significant risk noted.',
      );
      expect(result.validationStatus).toBe('accepted');
    });

    it('still returns the generated explanation, without citations, when citation resolution fails', async () => {
      const check = safetyCheckResultFixtures.majorAllergyConflict;
      safetyResultPort.registerById(7, check);
      const citationResolver = {
        resolve: jest.fn().mockRejectedValue(new Error('db unavailable')),
      };
      const service = createService(
        safetyResultPort,
        mockOrchestrator(
          jest.fn().mockResolvedValue({
            text: 'Fresh explanation with significant risk noted.',
            citationIds: ['label-chunk-1'],
            validationStatus: 'accepted',
            promptVersion: 'v1',
          }),
        ),
        mockCache() as never,
        citationResolver as never,
      );

      const result = await service.getExplanation(7, check.patientId);

      expect(result.text).toBe(
        'Fresh explanation with significant risk noted.',
      );
      expect(result.citations).toEqual([]);
    });

    it('still returns a cached explanation, without citations, when citation resolution fails on a cache hit', async () => {
      const check = safetyCheckResultFixtures.majorAllergyConflict;
      safetyResultPort.registerById(7, check);
      const cache = mockCache();
      cache.findByHash.mockResolvedValue({
        text: 'Cached explanation.',
        citations: ['label-chunk-1'],
        validationStatus: 'accepted',
      });
      const citationResolver = {
        resolve: jest.fn().mockRejectedValue(new Error('db unavailable')),
      };
      const service = createService(
        safetyResultPort,
        mockOrchestrator(jest.fn()),
        cache as never,
        citationResolver as never,
      );

      const result = await service.getExplanation(7, check.patientId);

      expect(result.text).toBe('Cached explanation.');
      expect(result.cached).toBe(true);
      expect(result.citations).toEqual([]);
    });
  });
});
