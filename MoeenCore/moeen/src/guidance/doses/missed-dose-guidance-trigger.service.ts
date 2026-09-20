import { Injectable, Logger } from '@nestjs/common';
import { PipelineOrchestrator } from '../orchestrator/pipeline-orchestrator.service';
import { GuidanceRequest } from '../contracts';
import { DoseLogRepository } from '../../database/repository/dose-log.repository';
import { GuidanceMessageWriter } from './guidance-message-writer.service';

/**
 * Invoked after a dose is durably marked missed. A failure is logged and
 * rethrown so BullMQ can retry guidance without risking the committed dose
 * transition.
 */
@Injectable()
export class MissedDoseGuidanceTrigger {
  private readonly logger = new Logger(MissedDoseGuidanceTrigger.name);

  constructor(
    private readonly orchestrator: PipelineOrchestrator,
    private readonly doseLogRepository: DoseLogRepository,
    private readonly guidanceMessageWriter: GuidanceMessageWriter,
  ) {}

  async trigger(
    doseLogId: number,
    safetyRunId: string | null = null,
  ): Promise<void> {
    try {
      const subject =
        await this.doseLogRepository.findMissedDoseGuidanceSubject(doseLogId);
      if (!subject) return; // dose_log or its user_medication vanished; nothing to guide on

      const request: GuidanceRequest = {
        patientId: subject.patientId,
        intent: 'missed_dose',
        safetyRunId,
        subjectMedicationId: subject.subjectMedicationId,
      };

      const response = await this.orchestrator.run(request, 'missed_dose_job');
      await this.guidanceMessageWriter.write(
        subject.scheduleTimeId,
        new Date().toISOString().slice(0, 10),
        response,
        safetyRunId,
      );
    } catch (error) {
      this.logger.error(
        `missed-dose guidance failed for doseLog ${doseLogId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
