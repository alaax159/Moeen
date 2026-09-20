import { Injectable } from '@nestjs/common';
import { SafetyResultPort } from '../adapters/safety-result-adapter/safety-result-adapter.port';
import { SafetyCheckResult } from '../contracts';
import { safetyCheckResultFixtures } from './safety-check-results.fixture';

@Injectable()
export class MockSafetyResultAdapter implements SafetyResultPort {
  private current: SafetyCheckResult = safetyCheckResultFixtures.clear;
  private byFindingId = new Map<string, SafetyCheckResult>();

  setResult(result: SafetyCheckResult): void {
    this.current = result;
  }

  registerById(findingId: string | number, result: SafetyCheckResult): void {
    this.byFindingId.set(String(findingId), result);
  }

  getLatestForPatient(patientId: number): Promise<SafetyCheckResult> {
    void patientId;
    return Promise.resolve(this.current);
  }

  getLatestForMedication(
    patientId: number,
    subjectMedicationId: number,
  ): Promise<SafetyCheckResult> {
    return Promise.resolve(
      this.current.patientId === patientId &&
        this.current.subjectUserMedicationId === subjectMedicationId
        ? this.current
        : this.getUnverifiedForPatient(patientId),
    );
  }

  getCurrentRunForPatient(
    patientId: number,
    runId: string,
  ): Promise<SafetyCheckResult> {
    return Promise.resolve(
      this.current.runId === runId && this.current.patientId === patientId
        ? this.current
        : this.getUnverifiedForPatient(patientId),
    );
  }

  getRunById(runId: string): Promise<SafetyCheckResult | null> {
    return Promise.resolve(this.current.runId === runId ? this.current : null);
  }

  getFindingById(
    findingId: string,
    patientId: number,
  ): Promise<SafetyCheckResult | null> {
    const result = this.byFindingId.get(findingId);
    return Promise.resolve(result?.patientId === patientId ? result : null);
  }

  getUnverifiedForPatient(patientId: number): SafetyCheckResult {
    const now = new Date().toISOString();
    return {
      runId: `no-safety-run-${patientId}`,
      id: `no-safety-run-${patientId}`,
      patientId,
      trigger: 'manual_recheck',
      requiredChecks: [],
      coverage: { status: 'partial', checks: [] },
      outcome: 'unverified',
      engineVersion: 'none',
      datasetVersions: {},
      contextHash: 'none',
      startedAt: now,
      completedAt: now,
      checkedAt: now,
      severity: 'unverified',
      findings: [],
    };
  }
}
