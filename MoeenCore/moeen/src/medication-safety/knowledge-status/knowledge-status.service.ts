import { Injectable } from '@nestjs/common';

import { HealthProfileRepository } from '../../database/repository/health-profile.repository';
import { MedicationSafetyWarning } from '../medication-safety.contracts';

@Injectable()
export class KnowledgeStatusService {
  constructor(
    private readonly healthProfileRepository: HealthProfileRepository,
  ) {}

  async evaluate(userMedicationId: number) {
    const status =
      await this.healthProfileRepository.getKnowledgeStatusByUserMedicationId(
        userMedicationId,
      );

    const warnings: MedicationSafetyWarning[] = [];

    if (!status || status.allergyKnowledgeStatus === 'unknown') {
      warnings.push({
        warningType: 'drug_allergy',
        severity: 'unknown',
        message:
          'Allergy information is missing. Medication safety could not be fully verified.',
      });
    }

    if (!status || status.conditionKnowledgeStatus === 'unknown') {
      warnings.push({
        warningType: 'drug_condition',
        severity: 'unknown',
        message:
          'Chronic condition information is missing. Medication safety could not be fully verified.',
      });
    }

    return {
      allergyKnowledgeStatus: status?.allergyKnowledgeStatus ?? 'unknown',
      conditionKnowledgeStatus: status?.conditionKnowledgeStatus ?? 'unknown',
      checkAllergies: status?.allergyKnowledgeStatus === 'has_records',
      checkConditions: status?.conditionKnowledgeStatus === 'has_records',
      warnings,
    };
  }
}
