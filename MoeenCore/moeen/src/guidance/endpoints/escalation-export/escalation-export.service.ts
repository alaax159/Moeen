import { Injectable } from '@nestjs/common';

import { DoseLogRepository } from '../../../database/repository/dose-log.repository';
import { UserMedicationRepository } from '../../../database/repository/user-medication.repository';
import {
  EscalationExportDoseDto,
  EscalationExportMedicationDto,
  EscalationExportResponseDto,
} from './dto/escalation-export-response.dto';

/**
 * Read-only snapshot of a patient's current medications and recent dose history,
 * for the serious-reaction escalation screen. Pure aggregation of two existing
 * repositories — no side effects, no safety logic.
 */
@Injectable()
export class EscalationExportService {
  constructor(
    private readonly userMedicationRepository: UserMedicationRepository,
    private readonly doseLogRepository: DoseLogRepository,
  ) {}

  async getExport(userId: number): Promise<EscalationExportResponseDto> {
    const [medications, recentDoses] = await Promise.all([
      this.userMedicationRepository.getCurrentMedicationsByUserId(userId),
      this.doseLogRepository.getRecentDoseLogsByUserId(userId),
    ]);

    return {
      medications: medications.map(
        (medication): EscalationExportMedicationDto => ({
          userMedicationId: medication.id,
          brandName: medication.brandName,
          genericName: medication.genericName,
          dosageAmount: medication.dosageAmount,
          dosageUnit: medication.dosageUnit,
          dosageForm: medication.dosageForm,
          frequency: medication.frequency,
          instructions: medication.instructions,
          scheduleTimes: medication.scheduleTimes,
        }),
      ),
      recentDoses: recentDoses.map(
        (dose): EscalationExportDoseDto => ({
          userMedicationId: dose.userMedicationId,
          brandName: dose.brandName,
          genericName: dose.genericName,
          date: dose.date,
          scheduledFor: dose.scheduledFor.toISOString(),
          status: dose.status,
          markedAt: dose.markedAt.toISOString(),
        }),
      ),
    };
  }
}
