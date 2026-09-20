import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';

import { EmergencyContactNotificationService } from '../emergency-support/emergency-contact-notification.service';
import { meetsEscalationThreshold } from '../guidance/escalation-policy';

import { KnowledgeStatusService } from './knowledge-status/knowledge-status.service';
import {
  DRUG_ALLERGY_CHECKER,
  DRUG_CONDITION_CHECKER,
  DRUG_DRUG_CHECKER,
} from './medication-safety.contracts';
import type {
  MedicationSafetyChecker,
  MedicationSafetyCheckerResult,
  MedicationSafetyCheckerStatus,
  MedicationSafetyCheckType,
  MedicationSafetyEvent,
  MedicationSafetyFindingSeverity,
  MedicationSafetyOutcome,
  MedicationSafetyResult,
  MedicationSafetySeverity,
  MedicationSafetyWarning,
} from './medication-safety.contracts';
import { MedicationSafetyRunRepository } from './persistence/medication-safety-run.repository';
import { resolveCoverageStatus } from './persistence/safety-projection-policy';

const ENGINE_VERSION = 'medication-safety-v2';
const FINDING_SEVERITIES: MedicationSafetyFindingSeverity[] = [
  'minor',
  'moderate',
  'major',
  'contraindicated',
];

type PlannedChecker = {
  checkerType: MedicationSafetyCheckType;
  checker?: MedicationSafetyChecker;
  skippedStatus?: Extract<
    MedicationSafetyCheckerStatus,
    'not_applicable' | 'unavailable'
  >;
  reasonCode?: string;
};

@Injectable()
export class MedicationSafetyRouterService {
  private readonly logger = new Logger(MedicationSafetyRouterService.name);

  constructor(
    @Inject(DRUG_DRUG_CHECKER)
    private readonly drugDrugChecker: MedicationSafetyChecker,
    @Inject(DRUG_ALLERGY_CHECKER)
    private readonly drugAllergyChecker: MedicationSafetyChecker,
    @Inject(DRUG_CONDITION_CHECKER)
    private readonly drugConditionChecker: MedicationSafetyChecker,
    private readonly knowledgeStatusService: KnowledgeStatusService,
    private readonly runRepository: MedicationSafetyRunRepository,
    private readonly emergencyContactNotificationService: EmergencyContactNotificationService,
  ) {}

  async route(event: MedicationSafetyEvent): Promise<MedicationSafetyResult> {
    if (event.type === 'medication_precheck') {
      return this.routePrecheck(event);
    }

    if (event.userMedicationId === undefined) {
      throw new BadRequestException(
        'userMedicationId is required for persisted medication events',
      );
    }

    const startedAt = new Date();
    const context = await this.runRepository.captureContext(
      event.userMedicationId,
    );
    const plan = await this.buildPlan(event);
    const checkerResults = await Promise.all(
      plan.map((entry) => this.executeChecker(entry, event)),
    );
    const completedAt = new Date();
    const result = this.summarize(checkerResults);
    const contextHash = this.runRepository.hashContext(context);
    const idempotencyKey =
      event.idempotencyKey ??
      `${event.type}:${event.userMedicationId}:${contextHash}:${randomUUID()}`;
    const runId = await this.runRepository.persistRun({
      subjectUserMedicationId: event.userMedicationId,
      trigger: event.type,
      idempotencyKey,
      engineVersion: ENGINE_VERSION,
      context,
      contextHash,
      startedAt,
      completedAt,
      requiredChecks: plan.map(({ checkerType }) => checkerType),
      outcome: result.outcome,
      coverageStatus: result.coverageStatus,
      checkerResults,
    });

    if (meetsEscalationThreshold(result.severity)) {
      try {
        await this.emergencyContactNotificationService.notify(
          context.userId,
          'severe_medication_reaction',
        );
      } catch (error) {
        this.logger.error(
          `Emergency-contact notification failed for user ${context.userId}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    return {
      ...result,
      runId,
    };
  }

  private async routePrecheck(
    event: MedicationSafetyEvent,
  ): Promise<MedicationSafetyResult> {
    if (!event.draft) {
      throw new BadRequestException(
        'draft is required for medication precheck',
      );
    }

    if (
      event.draft.verificationSource === 'manual' &&
      event.draft.verificationStatus === 'unresolved'
    ) {
      return this.summarize([]);
    }

    const plan = await this.buildPlan(event);
    const checkerResults = await Promise.all(
      plan.map((entry) => this.executeChecker(entry, event)),
    );

    return this.summarize(checkerResults);
  }

  private async buildPlan(
    event: MedicationSafetyEvent,
  ): Promise<PlannedChecker[]> {
    if (
      event.type === 'medication_precheck' ||
      event.type === 'active_review'
    ) {
      return [
        { checkerType: 'drug_allergy', checker: this.drugAllergyChecker },
        { checkerType: 'drug_condition', checker: this.drugConditionChecker },
        { checkerType: 'drug_drug', checker: this.drugDrugChecker },
      ];
    }

    if (event.type === 'dose_missed') {
      return [{ checkerType: 'drug_drug', checker: this.drugDrugChecker }];
    }

    if (event.userMedicationId === undefined) {
      throw new BadRequestException(
        'userMedicationId is required for persisted medication events',
      );
    }
    const knowledge = await this.knowledgeStatusService.evaluate(
      event.userMedicationId,
    );

    return [
      { checkerType: 'drug_drug', checker: this.drugDrugChecker },
      this.knowledgeAwareChecker(
        'drug_allergy',
        knowledge.allergyKnowledgeStatus,
        this.drugAllergyChecker,
      ),
      this.knowledgeAwareChecker(
        'drug_condition',
        knowledge.conditionKnowledgeStatus,
        this.drugConditionChecker,
      ),
    ];
  }

  private knowledgeAwareChecker(
    checkerType: MedicationSafetyCheckType,
    knowledgeStatus: 'unknown' | 'none_known' | 'has_records',
    checker: MedicationSafetyChecker,
  ): PlannedChecker {
    if (knowledgeStatus === 'has_records') return { checkerType, checker };
    if (knowledgeStatus === 'none_known') {
      return {
        checkerType,
        skippedStatus: 'not_applicable',
        reasonCode: 'patient_confirmed_none_known',
      };
    }
    return {
      checkerType,
      skippedStatus: 'unavailable',
      reasonCode: 'patient_knowledge_unknown',
    };
  }

  private async executeChecker(
    plan: PlannedChecker,
    event: MedicationSafetyEvent,
  ): Promise<MedicationSafetyCheckerResult> {
    const checkedAt = new Date();
    if (!plan.checker) {
      return {
        checkerType: plan.checkerType,
        status: plan.skippedStatus!,
        reasonCode: plan.reasonCode,
        datasetVersions: {},
        evidence: [],
        checkedAt,
        warnings: [],
      };
    }

    try {
      const rawWarnings = await plan.checker.check(event);
      const warnings = rawWarnings
        .filter(
          (warning) =>
            warning.warningType === plan.checkerType &&
            this.isClinicalFinding(warning),
        )
        .map((warning) =>
          warning.subjectUserMedicationIds !== undefined ||
          event.userMedicationId === undefined
            ? warning
            : {
                ...warning,
                subjectUserMedicationIds: [event.userMedicationId],
              },
        );
      const unknownCount = rawWarnings.length - warnings.length;

      return {
        checkerType: plan.checkerType,
        status:
          unknownCount === 0
            ? 'verified'
            : warnings.length > 0
              ? 'partial'
              : 'unavailable',
        reasonCode:
          unknownCount > 0 ? 'checker_returned_unknown_result' : undefined,
        datasetVersions: {},
        evidence: [],
        checkedAt,
        warnings,
      };
    } catch (error) {
      // A failed checker degrades the whole run to unverified, so this must be
      // visible in logs — otherwise a persistent checker bug silently leaves
      // every affected patient's safety state ungraded with no signal.
      this.logger.error(
        `${plan.checkerType} checker failed for user medication ` +
          `${event.userMedicationId ?? '(precheck draft)'}: ` +
          `${error instanceof Error ? error.message : 'unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        checkerType: plan.checkerType,
        status: 'failed',
        reasonCode: `${plan.checkerType}_checker_failed`,
        datasetVersions: {},
        evidence: [],
        checkedAt,
        warnings: [],
      };
    }
  }

  private summarize(
    checkerResults: MedicationSafetyCheckerResult[],
  ): Omit<MedicationSafetyResult, 'runId'> {
    const warnings = checkerResults.flatMap((result) => result.warnings);
    const coverageStatus = resolveCoverageStatus(
      checkerResults.map((result) => result.status),
    );
    const outcome: MedicationSafetyOutcome =
      warnings.length > 0
        ? 'findings'
        : coverageStatus === 'complete'
          ? 'clear'
          : 'unverified';

    return {
      safe: outcome === 'clear',
      outcome,
      coverageStatus,
      severity: this.resolveSeverity(outcome, warnings),
      warnings,
      checkerResults,
    };
  }

  private isClinicalFinding(
    warning: MedicationSafetyWarning,
  ): warning is MedicationSafetyWarning & {
    severity: MedicationSafetyFindingSeverity;
  } {
    return FINDING_SEVERITIES.includes(
      warning.severity as MedicationSafetyFindingSeverity,
    );
  }

  private resolveSeverity(
    outcome: MedicationSafetyOutcome,
    warnings: MedicationSafetyWarning[],
  ): MedicationSafetySeverity {
    if (outcome === 'clear') return 'clear';
    if (outcome === 'unverified') return 'unverified';

    return warnings.reduce<MedicationSafetyFindingSeverity>(
      (highest, warning) =>
        FINDING_SEVERITIES.indexOf(
          warning.severity as MedicationSafetyFindingSeverity,
        ) > FINDING_SEVERITIES.indexOf(highest)
          ? (warning.severity as MedicationSafetyFindingSeverity)
          : highest,
      'minor',
    );
  }
}
