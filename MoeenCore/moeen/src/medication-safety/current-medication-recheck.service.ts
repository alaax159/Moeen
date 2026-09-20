import { Injectable } from '@nestjs/common';

import { UserMedicationRepository } from '../database/repository/user-medication.repository';
import { MedicationSafetyRouterService } from './medication-safety-router.service';

@Injectable()
export class CurrentMedicationRecheckService {
  constructor(
    private readonly userMedicationRepository: UserMedicationRepository,
    private readonly medicationSafetyRouter: MedicationSafetyRouterService,
  ) {}

  async recheckUser(userId: number): Promise<void> {
    const activeMedications =
      await this.userMedicationRepository.getActiveMedicationsByUserId(userId);

    for (const medication of activeMedications) {
      await this.medicationSafetyRouter.route({
        type: 'medication_updated',
        userMedicationId: medication.id,
      });
    }
  }
}
