import { Injectable } from '@nestjs/common';

import { HealthProfileRepository } from '../database/repository/health-profile.repository';
import { UserMedicationRepository } from '../database/repository/user-medication.repository';
import { EmergencyMedicalCardDto } from './dto/emergency-medical-card.dto';

@Injectable()
export class EmergencyMedicalCardService {
  constructor(
    private readonly healthProfileRepository: HealthProfileRepository,
    private readonly userMedicationRepository: UserMedicationRepository,
  ) {}

  async getEmergencyMedicalCard(
    userId: number,
  ): Promise<EmergencyMedicalCardDto> {
    const [
      profile,
      allergies,
      chronicConditions,
      currentMedications,
      latestMedicationUpdatedAt,
    ] = await Promise.all([
      this.healthProfileRepository.getEmergencyCardProfileByUserId(userId),
      this.healthProfileRepository.getEmergencyCardActiveAllergiesByUserId(
        userId,
      ),
      this.healthProfileRepository.getActiveChronicConditionsByUserId(userId),
      this.userMedicationRepository.getCurrentMedicationsByUserId(userId),
      this.userMedicationRepository.getLatestMedicationUpdatedAtByUserId(
        userId,
      ),
    ]);

    const timestamps: Date[] = [];
    if (profile?.updatedAt) timestamps.push(profile.updatedAt);
    for (const allergy of allergies) timestamps.push(allergy.updatedAt);
    for (const condition of chronicConditions)
      timestamps.push(condition.updatedAt);
    for (const medication of currentMedications) {
      timestamps.push(medication.updatedAt);
      if (medication.scheduleUpdatedAt) {
        timestamps.push(medication.scheduleUpdatedAt);
      }
    }
    if (latestMedicationUpdatedAt) timestamps.push(latestMedicationUpdatedAt);

    const lastUpdated = timestamps.length
      ? new Date(
          Math.max(...timestamps.map((timestamp) => timestamp.getTime())),
        ).toISOString()
      : null;

    return {
      patient: {
        firstName: profile?.firstName ?? null,
        lastName: profile?.lastName ?? null,
        dateOfBirth: profile?.dateOfBirth ?? null,
        gender: profile?.gender ?? null,
        bloodType: profile?.bloodType ?? null,
      },
      allergies: allergies.map(({ name, reaction, severity }) => ({
        name,
        reaction,
        severity,
      })),
      chronicConditions: chronicConditions.map(({ name }) => ({ name })),
      medications: currentMedications.map((medication) => ({
        name: medication.brandName ?? medication.genericName,
        normalizedName: medication.genericName,
        dose: Number(medication.dosageAmount),
        unit: medication.dosageUnit,
        dosageForm: medication.dosageForm,
        frequency: medication.frequency,
        instructions: medication.instructions,
        times: medication.scheduleTimes,
      })),
      // TODO(AB#4213): populate from emergency_contact table once
      // Manage Emergency Contacts backend (AB#4198) is merged
      // A phone alone cannot safely populate the name/phone contact contract.
      emergencyContacts: [],
      lastUpdated,
    };
  }
}
