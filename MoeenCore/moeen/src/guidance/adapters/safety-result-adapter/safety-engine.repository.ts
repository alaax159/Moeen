import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../../../database/database.constants';
import * as schema from '../../../database/schema';

type Database = NodePgDatabase<typeof schema>;

export interface PersistedSafetyRun {
  run: typeof schema.medicationSafetyRun.$inferSelect;
  checkerResults: (typeof schema.medicationSafetyCheckerResult.$inferSelect)[];
  findings: (typeof schema.medicationSafetyFinding.$inferSelect)[];
  evidence: (typeof schema.medicationSafetyEvidence.$inferSelect)[];
}

@Injectable()
export class SafetyEngineRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findLatestRunForPatient(
    patientId: number,
  ): Promise<PersistedSafetyRun | null> {
    const [run] = await this.db
      .select({ run: schema.medicationSafetyRun })
      .from(schema.medicationSafetyRun)
      .innerJoin(
        schema.patientSafetyState,
        and(
          eq(
            schema.medicationSafetyRun.userId,
            schema.patientSafetyState.userId,
          ),
          eq(
            schema.medicationSafetyRun.contextVersion,
            schema.patientSafetyState.contextVersion,
          ),
        ),
      )
      .innerJoin(
        schema.userMedication,
        eq(
          schema.medicationSafetyRun.subjectUserMedicationId,
          schema.userMedication.id,
        ),
      )
      .where(
        and(
          eq(schema.medicationSafetyRun.userId, patientId),
          eq(schema.userMedication.status, 'active'),
          eq(schema.userMedication.completion, 'ongoing'),
        ),
      )
      .orderBy(
        desc(schema.medicationSafetyRun.completedAt),
        desc(schema.medicationSafetyRun.createdAt),
      )
      .limit(1);

    return run ? this.hydrate(run.run) : null;
  }

  async findLatestRunForMedication(
    patientId: number,
    subjectMedicationId: number,
  ): Promise<PersistedSafetyRun | null> {
    const [run] = await this.db
      .select({ run: schema.medicationSafetyRun })
      .from(schema.medicationSafetyRun)
      .innerJoin(
        schema.patientSafetyState,
        and(
          eq(
            schema.medicationSafetyRun.userId,
            schema.patientSafetyState.userId,
          ),
          eq(
            schema.medicationSafetyRun.contextVersion,
            schema.patientSafetyState.contextVersion,
          ),
        ),
      )
      .innerJoin(
        schema.userMedication,
        eq(
          schema.medicationSafetyRun.subjectUserMedicationId,
          schema.userMedication.id,
        ),
      )
      .where(
        and(
          eq(schema.medicationSafetyRun.userId, patientId),
          eq(
            schema.medicationSafetyRun.subjectUserMedicationId,
            subjectMedicationId,
          ),
          eq(schema.userMedication.userId, patientId),
          eq(schema.userMedication.status, 'active'),
          eq(schema.userMedication.completion, 'ongoing'),
        ),
      )
      .orderBy(
        desc(schema.medicationSafetyRun.completedAt),
        desc(schema.medicationSafetyRun.createdAt),
      )
      .limit(1);

    return run ? this.hydrate(run.run) : null;
  }

  async findRunById(runId: string): Promise<PersistedSafetyRun | null> {
    const [run] = await this.db
      .select()
      .from(schema.medicationSafetyRun)
      .where(eq(schema.medicationSafetyRun.id, runId))
      .limit(1);

    return run ? this.hydrate(run) : null;
  }

  async findCurrentRunForPatient(
    runId: string,
    patientId: number,
  ): Promise<PersistedSafetyRun | null> {
    const [run] = await this.db
      .select({ run: schema.medicationSafetyRun })
      .from(schema.medicationSafetyRun)
      .innerJoin(
        schema.patientSafetyState,
        and(
          eq(
            schema.medicationSafetyRun.userId,
            schema.patientSafetyState.userId,
          ),
          eq(
            schema.medicationSafetyRun.contextVersion,
            schema.patientSafetyState.contextVersion,
          ),
        ),
      )
      .innerJoin(
        schema.userMedication,
        eq(
          schema.medicationSafetyRun.subjectUserMedicationId,
          schema.userMedication.id,
        ),
      )
      .where(
        and(
          eq(schema.medicationSafetyRun.id, runId),
          eq(schema.medicationSafetyRun.userId, patientId),
          eq(schema.userMedication.status, 'active'),
          eq(schema.userMedication.completion, 'ongoing'),
        ),
      )
      .limit(1);

    return run ? this.hydrate(run.run) : null;
  }

  async findFindingById(
    findingId: string,
    patientId: number,
  ): Promise<PersistedSafetyRun | null> {
    const [match] = await this.db
      .select({ run: schema.medicationSafetyRun })
      .from(schema.medicationSafetyFinding)
      .innerJoin(
        schema.medicationSafetyCheckerResult,
        eq(
          schema.medicationSafetyFinding.checkerResultId,
          schema.medicationSafetyCheckerResult.id,
        ),
      )
      .innerJoin(
        schema.medicationSafetyRun,
        eq(
          schema.medicationSafetyCheckerResult.runId,
          schema.medicationSafetyRun.id,
        ),
      )
      .innerJoin(
        schema.patientSafetyState,
        and(
          eq(
            schema.medicationSafetyRun.userId,
            schema.patientSafetyState.userId,
          ),
          eq(
            schema.medicationSafetyRun.contextVersion,
            schema.patientSafetyState.contextVersion,
          ),
        ),
      )
      .innerJoin(
        schema.userMedication,
        eq(
          schema.medicationSafetyRun.subjectUserMedicationId,
          schema.userMedication.id,
        ),
      )
      .where(
        and(
          eq(schema.medicationSafetyFinding.id, findingId),
          eq(schema.medicationSafetyRun.userId, patientId),
          eq(schema.userMedication.userId, patientId),
          eq(schema.userMedication.status, 'active'),
          eq(schema.userMedication.completion, 'ongoing'),
        ),
      )
      .limit(1);

    if (!match) return null;

    const hydrated = await this.hydrate(match.run);
    const findings = hydrated.findings.filter(({ id }) => id === findingId);

    return {
      run: hydrated.run,
      checkerResults: hydrated.checkerResults,
      findings,
      evidence: hydrated.evidence.filter(
        (evidence) =>
          evidence.findingId === null || evidence.findingId === findingId,
      ),
    };
  }

  private async hydrate(
    run: typeof schema.medicationSafetyRun.$inferSelect,
  ): Promise<PersistedSafetyRun> {
    const checkerResults = await this.db
      .select()
      .from(schema.medicationSafetyCheckerResult)
      .where(eq(schema.medicationSafetyCheckerResult.runId, run.id));
    const checkerResultIds = checkerResults.map(({ id }) => id);

    if (checkerResultIds.length === 0) {
      return { run, checkerResults, findings: [], evidence: [] };
    }

    const [findings, evidence] = await Promise.all([
      this.db
        .select()
        .from(schema.medicationSafetyFinding)
        .where(
          inArray(
            schema.medicationSafetyFinding.checkerResultId,
            checkerResultIds,
          ),
        ),
      this.db
        .select()
        .from(schema.medicationSafetyEvidence)
        .where(
          inArray(
            schema.medicationSafetyEvidence.checkerResultId,
            checkerResultIds,
          ),
        ),
    ]);

    return { run, checkerResults, findings, evidence };
  }
}
