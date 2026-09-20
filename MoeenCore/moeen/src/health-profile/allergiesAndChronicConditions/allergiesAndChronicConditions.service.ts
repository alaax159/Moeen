import { Injectable, NotFoundException } from '@nestjs/common';

import { HealthProfileRepository } from '../../database/repository/health-profile.repository';
import { CurrentMedicationRecheckQueue } from '../../medication-safety/current-medication-recheck-queue/current-medication-recheck.queue';
import {
  CreateAllergyDto,
  CreateChronicConditionDto,
} from '../dto/addAllergiesAndChronicCondition.dto';

@Injectable()
export class AllergiesAndChronicConditionsService {
  constructor(
    private readonly healthProfileRepository: HealthProfileRepository,
    private readonly currentMedicationRecheckQueue: CurrentMedicationRecheckQueue,
  ) {}

  async createAllergy(firebaseUid: string, dto: CreateAllergyDto) {
    const allergy = await this.healthProfileRepository.createAllergy(
      firebaseUid,
      dto,
    );

    if (allergy) {
      await this.currentMedicationRecheckQueue.enqueue(allergy.userId);
    }

    return allergy;
  }

  getAllergies(firebaseUid: string) {
    return this.healthProfileRepository.getAllergiesByFirebaseUid(firebaseUid);
  }

  async deactivateAllergy(firebaseUid: string, id: number) {
    const allergy = await this.healthProfileRepository.deactivateAllergy(
      firebaseUid,
      id,
    );

    if (!allergy) {
      throw new NotFoundException('Allergy was not found');
    }

    await this.currentMedicationRecheckQueue.enqueue(allergy.userId);
  }

  async createChronicCondition(
    firebaseUid: string,
    dto: CreateChronicConditionDto,
  ) {
    const condition = await this.healthProfileRepository.createChronicCondition(
      firebaseUid,
      dto,
    );

    if (condition) {
      await this.currentMedicationRecheckQueue.enqueue(condition.userId);
    }

    return condition;
  }

  getChronicConditions(firebaseUid: string) {
    return this.healthProfileRepository.getChronicConditionsByFirebaseUid(
      firebaseUid,
    );
  }

  async deactivateChronicCondition(firebaseUid: string, id: number) {
    const condition =
      await this.healthProfileRepository.deactivateChronicCondition(
        firebaseUid,
        id,
      );

    if (!condition) {
      throw new NotFoundException('Chronic condition was not found');
    }

    await this.currentMedicationRecheckQueue.enqueue(condition.userId);
  }
}
