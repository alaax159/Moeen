import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../../../database/database.constants';
import * as schema from '../../../database/schema';
import type {
  GuidanceRequest,
  PatientScope,
  RetrievalResult,
} from '../../contracts';
import type { RedactionSubject } from '../../context/redactor/redactor.port';
import type {
  AssembledPrompt as OrchestratorAssembledPrompt,
  AssemblerPort,
} from '../../orchestrator/assembler.port';
import type { PromptPayload } from '../provider-gateway/prompt-payload';
import { PROMPT_ASSEMBLER_PORT } from './prompt-assembler.port';
import type { PromptAssemblerPort } from './prompt-assembler.port';

type Database = NodePgDatabase<typeof schema>;

/**
 * The assemble stage of the pipeline, as the orchestrator sees it.
 *
 * PromptAssembler is a pure formatter — it takes a scope, chunks and an intent
 * and returns two strings. AssemblerPort asks for something slightly wider: a
 * dispatchable payload plus the RedactionSubject the gateway scrubs with. This
 * class is the difference between the two, and it exists so PromptAssembler
 * can stay free of database access and the orchestrator can stay free of
 * knowing how a prompt is built.
 *
 * It also resolves the two lookups the port's own doc comment left open, both
 * of which needed a data source neither side had:
 *
 *   subjectMedicationName — PatientScopeMedication carries no id, so a scope
 *   cannot map subjectMedicationId onto one of its own entries. Resolved here
 *   from user_medication.
 *
 *   redactionSubject — PatientScope excludes the patient's name by design, and
 *   correctly so; the redactor still needs it to strip that name from free
 *   text. Read straight from users and handed to the gateway beside the
 *   payload, never inside it, so it is never part of what gets sent.
 */
@Injectable()
export class PromptAssemblyStage implements AssemblerPort {
  constructor(
    @Inject(PROMPT_ASSEMBLER_PORT)
    private readonly assembler: PromptAssemblerPort,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async assemble(
    scope: PatientScope,
    retrieval: RetrievalResult,
    request: GuidanceRequest,
  ): Promise<OrchestratorAssembledPrompt> {
    const [subjectMedicationName, redactionSubject] = await Promise.all([
      this.resolveSubjectMedicationName(
        scope.subjectMedicationId,
        request.patientId,
      ),
      this.resolveRedactionSubject(request.patientId),
    ]);

    const assembled = this.assembler.assemble({
      intent: request.intent,
      scope,
      retrieval,
      // Passed through from the engine's resolved value, never recomputed
      // from scope.findings — the generative layer explains this severity.
      severity: scope.safetySeverity,
      question: request.question,
      subjectMedicationName,
    });

    const payload: PromptPayload = {
      systemPrompt: assembled.systemPrompt,
      userPrompt: assembled.userPrompt,
    };

    return {
      payload,
      redactionSubject,
      promptVersion: assembled.promptVersion,
    };
  }

  /**
   * Undefined rather than a guess when the medication cannot be resolved or
   * has no generic name — the templates say so plainly in that case, which is
   * better than naming the wrong medicine or leaking a brand name into a slot
   * documented as an ingredient.
   */
  private async resolveSubjectMedicationName(
    subjectMedicationId: number | undefined,
    patientId: number,
  ): Promise<string | undefined> {
    if (subjectMedicationId === undefined) return undefined;

    const [row] = await this.db
      .select({ genericName: schema.medication.genericName })
      .from(schema.userMedication)
      .innerJoin(
        schema.medication,
        eq(schema.userMedication.medicationId, schema.medication.id),
      )
      .where(
        and(
          eq(schema.userMedication.id, subjectMedicationId),
          eq(schema.userMedication.userId, patientId),
        ),
      )
      .limit(1);

    return row?.genericName ?? undefined;
  }

  /**
   * An empty subject is a valid answer, not a failure: a patient who has not
   * given a name has no name to strip. The redactor's other patterns — email,
   * phone, dates, UUIDs — do not depend on this and still run.
   */
  private async resolveRedactionSubject(
    patientId: number,
  ): Promise<RedactionSubject> {
    const [row] = await this.db
      .select({
        firstName: schema.user.firstName,
        lastName: schema.user.lastName,
      })
      .from(schema.user)
      .where(eq(schema.user.id, patientId))
      .limit(1);

    if (!row) return {};

    const firstName = row.firstName ?? undefined;
    const lastName = row.lastName ?? undefined;

    return {
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
      ...(firstName && lastName
        ? { fullName: `${firstName} ${lastName}` }
        : {}),
    };
  }
}
