import { Injectable } from '@nestjs/common';

import { SafetyWarningRepository } from '../database/repository/safety-warning.repository';
import { UserMedicationRepository } from '../database/repository/user-medication.repository';
import type { MedicationSafetyWarning } from './medication-safety.contracts';
import { MedicationSafetyRouterService } from './medication-safety-router.service';

const SEVERITY_RANK: Record<string, number> = {
  unknown: 0,
  low: 1,
  minor: 1,
  medium: 2,
  moderate: 2,
  high: 3,
  major: 4,
  contraindicated: 5,
};

@Injectable()
export class ActiveInteractionsService {
  constructor(
    private readonly userMedicationRepository: UserMedicationRepository,
    private readonly medicationSafetyRouter: MedicationSafetyRouterService,
    private readonly safetyWarningRepository: SafetyWarningRepository,
  ) {}

  async getActiveInteractions(firebaseUid: string) {
    const medications = await this.userMedicationRepository.getUserMedications(
      firebaseUid,
      'active',
    );

    const activeMedications = medications.filter(
      (medication) => medication.completion === 'ongoing',
    );

    if (!activeMedications.length) {
      return { interactions: [] };
    }

    await Promise.all(
      activeMedications.map((medication) =>
        this.medicationSafetyRouter.route({
          type: 'active_review',
          userMedicationId: medication.id,
        }),
      ),
    );

    const warnings = await this.safetyWarningRepository.getActiveWarnings(
      activeMedications.map((medication) => medication.id),
    );

    const unique = new Map<string, MedicationSafetyWarning>();

    for (const { affected, ...warning } of warnings) {
      const severity = warning.severity.toLowerCase();

      // "unknown" means the engine could not verify the interaction,
      // not that an active interaction was found.
      if (severity === 'unknown') {
        continue;
      }

      // Keyed per medication and per affected allergy/condition: warnings
      // that only differ by which medication or which allergy they concern
      // are distinct findings and must not collapse into one another.
      const key = [
        warning.userMedicationId,
        warning.warningType,
        severity,
        warning.message.trim().toLowerCase(),
        (affected ?? '').trim().toLowerCase(),
      ].join('|');

      if (!unique.has(key)) {
        unique.set(key, {
          ...warning,
          ...(affected === null ? {} : { affected }),
        });
      }
    }

    const interactions = Array.from(unique.values()).sort(
      (a, b) =>
        (SEVERITY_RANK[b.severity.toLowerCase()] ?? 0) -
        (SEVERITY_RANK[a.severity.toLowerCase()] ?? 0),
    );

    return { interactions };
  }
}
