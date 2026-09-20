import { HttpException, Injectable, Logger } from '@nestjs/common';

import { AddMedicationService } from '../medications/add-medication/add-medication.service';
import {
  ConfirmPrescriptionDto,
  ConfirmPrescriptionMedicationDto,
} from './dto/confirm-prescription.dto';
import {
  ConfirmPrescriptionItemResultDto,
  ConfirmPrescriptionItemStatus,
  ConfirmPrescriptionResponseDto,
} from './dto/confirm-prescription-response.dto';

const GENERIC_ITEM_ERROR =
  'This medication could not be added. Please review it and try again.';

const BLOCKED_BY_WARNINGS =
  'Review the safety warnings for this medication before adding it.';

const BLOCKED_BY_DUPLICATE =
  'You are already taking this medication. Review it before adding it again.';

@Injectable()
export class PrescriptionConfirmationService {
  private readonly logger = new Logger(PrescriptionConfirmationService.name);

  constructor(private readonly addMedicationService: AddMedicationService) {}

  // Confirms the reviewed prescription medications by running each one through
  // the existing add-medication flow. Medications are processed one at a time
  // and independently: a warning or failure on one never prevents the others
  // from being saved, and the caller gets a per-medication result.
  async confirmPrescription(
    dto: ConfirmPrescriptionDto,
    firebaseUid: string,
  ): Promise<ConfirmPrescriptionResponseDto> {
    const results: ConfirmPrescriptionItemResultDto[] = [];

    for (const [index, medication] of dto.medications.entries()) {
      results.push(
        await this.confirmMedication(medication, index, firebaseUid),
      );
    }

    return {
      addedCount: this.countBy(results, ConfirmPrescriptionItemStatus.ADDED),
      blockedCount: this.countBy(
        results,
        ConfirmPrescriptionItemStatus.BLOCKED,
      ),
      failedCount: this.countBy(results, ConfirmPrescriptionItemStatus.FAILED),
      results,
    };
  }

  private async confirmMedication(
    medication: ConfirmPrescriptionMedicationDto,
    index: number,
    firebaseUid: string,
  ): Promise<ConfirmPrescriptionItemResultDto> {
    const { acknowledgeWarnings = false, ...addMedicationDto } = medication;
    const name = this.resolveName(addMedicationDto);

    try {
      // Always run the safety pipeline, even when the user already
      // acknowledged warnings, so nothing is saved without being checked.
      const safety = await this.addMedicationService.checkSafety(
        addMedicationDto,
        firebaseUid,
      );

      const warnings = safety.warnings ?? [];
      const duplicateMedication = safety.duplicateMedication ?? null;
      const needsDecision = warnings.length > 0 || duplicateMedication !== null;

      if (needsDecision && !acknowledgeWarnings) {
        return {
          index,
          name,
          status: ConfirmPrescriptionItemStatus.BLOCKED,
          userMedicationId: null,
          warnings,
          duplicateMedication,
          message: duplicateMedication
            ? BLOCKED_BY_DUPLICATE
            : BLOCKED_BY_WARNINGS,
        };
      }

      const created = await this.addMedicationService.create(
        addMedicationDto,
        firebaseUid,
      );

      return {
        index,
        name,
        status: ConfirmPrescriptionItemStatus.ADDED,
        userMedicationId: created.userMedication.id,
        warnings,
        duplicateMedication: null,
        message: null,
      };
    } catch (error) {
      this.logger.warn(
        `Prescription confirmation failed for medication ${index}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );

      return {
        index,
        name,
        status: ConfirmPrescriptionItemStatus.FAILED,
        userMedicationId: null,
        warnings: [],
        duplicateMedication: null,
        // Only surface messages the API already returns to clients; anything
        // else is replaced with a generic message.
        message:
          error instanceof HttpException ? error.message : GENERIC_ITEM_ERROR,
      };
    }
  }

  private resolveName(dto: Omit<ConfirmPrescriptionMedicationDto, never>) {
    const { brandName, genericName } = dto.medication ?? {};

    return brandName?.trim() || genericName?.trim() || 'Medication';
  }

  private countBy(
    results: ConfirmPrescriptionItemResultDto[],
    status: ConfirmPrescriptionItemStatus,
  ) {
    return results.filter((result) => result.status === status).length;
  }
}
