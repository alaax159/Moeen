import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  and,
  desc,
  eq,
  getTableColumns,
  gte,
  isNull,
  lte,
  max,
  ne,
  or,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../database.constants';
import * as schema from '../schema';
import {
  AddMedicationDto,
  DurationOption,
  MedicationSource,
} from '../../medications/dto/add-medication.dto';
import { UpdateMedicationDto } from '../../medications/dto/update-medication.dto';
import { MedicationEventsService } from '../../medication-events/medication-events.service';
import { enqueueSafetyInvalidation } from '../../medication-safety/invalidation/safety-invalidation.writer';
import { stripDailyMedPrefix } from '../daily-med-id.util';

type Database = NodePgDatabase<typeof schema>;

export type CreateMedicationParams = {
  dailyMedId: string | null;
  scheduleTimes: string[];
  startDate: string;
  endDate: string | null;
};

@Injectable()
export class UserMedicationRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: Database,
    private readonly medicationEvents: MedicationEventsService,
  ) {}

  async getUserIdByFirebaseUid(
    firebaseUid: string,
  ): Promise<number | undefined> {
    const [currentUser] = await this.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.firebaseUid, firebaseUid))
      .limit(1);

    return currentUser?.id;
  }

  private currentMedicationWhere(userId: number) {
    // Match the treatment dates used by the Today view, including its timezone.
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Jerusalem',
    });
    return and(
      eq(schema.userMedication.userId, userId),
      eq(schema.userMedication.status, 'active'),
      eq(schema.userMedication.completion, 'ongoing'),
      lte(schema.userMedication.startDate, today),
      or(
        isNull(schema.userMedication.endDate),
        gte(schema.userMedication.endDate, today),
      ),
    );
  }

  async getMedicationSafetyContext(userMedicationId: number) {
    const [row] = await this.db
      .select({
        userMedicationId: schema.userMedication.id,
        userId: schema.userMedication.userId,
        medicationId: schema.userMedication.medicationId,
        brandName: schema.medication.brandName,
        genericName: schema.medication.genericName,
        rxcui: schema.medication.rxcui,
      })
      .from(schema.userMedication)
      .innerJoin(
        schema.medication,
        eq(schema.userMedication.medicationId, schema.medication.id),
      )
      .where(eq(schema.userMedication.id, userMedicationId))
      .limit(1);

    return row;
  }

  async getDraftSafetyContext(dto: AddMedicationDto, firebaseUid: string) {
    const userId = await this.getUserIdByFirebaseUid(firebaseUid);

    if (!userId) {
      throw new NotFoundException('User was not found');
    }

    if (dto.source === MedicationSource.EXISTING_DB && dto.medication.id) {
      const [medication] = await this.db
        .select({
          id: schema.medication.id,
          brandName: schema.medication.brandName,
          genericName: schema.medication.genericName,
          verificationSource: schema.medication.verificationSource,
          rxcui: schema.medication.rxcui,
        })
        .from(schema.medication)
        .where(eq(schema.medication.id, dto.medication.id))
        .limit(1);

      if (!medication) {
        throw new NotFoundException(
          `Medication ${dto.medication.id} was not found`,
        );
      }

      return {
        userId,
        medicationId: medication.id,
        dailyMedId: null,
        rxcui: medication.rxcui,
        brandName: medication.brandName,
        genericName: medication.genericName,
        verificationSource: medication.verificationSource,
        verificationStatus: 'verified' as const,
      };
    }

    if (
      dto.source === MedicationSource.PALESTINE_MOH &&
      dto.medication.medicationCatalogId
    ) {
      const [catalog] = await this.db
        .select({ name: schema.medicationCatalog.name })
        .from(schema.medicationCatalog)
        .where(
          eq(schema.medicationCatalog.id, dto.medication.medicationCatalogId),
        )
        .limit(1);

      if (!catalog) {
        throw new NotFoundException('Medication catalog entry was not found');
      }

      return {
        userId,
        medicationId: null,
        dailyMedId: null,
        rxcui: null,
        brandName: catalog.name,
        genericName: null,
        verificationSource: 'palestine_moh' as const,
        verificationStatus: 'verified' as const,
      };
    }

    if (
      dto.source === MedicationSource.RXNORM &&
      dto.medication.rxcui?.trim()
    ) {
      return {
        userId,
        medicationId: null,
        dailyMedId: null,
        rxcui: dto.medication.rxcui.trim(),
        brandName: dto.medication.brandName ?? null,
        genericName: dto.medication.genericName ?? null,
        verificationSource: 'rxnorm' as const,
        verificationStatus: 'verified' as const,
      };
    }

    return {
      userId,
      medicationId: null,
      dailyMedId:
        dto.source === MedicationSource.DAILYMED
          ? (dto.medication.dailymedId ?? null)
          : null,
      rxcui: null,
      brandName: dto.medication.brandName ?? null,
      genericName: dto.medication.genericName ?? null,
      verificationSource:
        dto.source === MedicationSource.DAILYMED
          ? ('dailymed' as const)
          : ('manual' as const),
      verificationStatus:
        dto.source === MedicationSource.DAILYMED
          ? ('verified' as const)
          : ('unresolved' as const),
    };
  }

  async getActiveMedicationsByUserId(userId: number) {
    return this.db
      .select({
        id: schema.userMedication.id,
        medicationId: schema.userMedication.medicationId,
        brandName: schema.medication.brandName,
        genericName: schema.medication.genericName,
        medicationCatalogId: schema.medication.medicationCatalogId,
        dailyMedId: schema.medication.dailyMedId,
        rxcui: schema.medication.rxcui,
      })
      .from(schema.userMedication)
      .innerJoin(
        schema.medication,
        eq(schema.userMedication.medicationId, schema.medication.id),
      )
      .where(this.currentMedicationWhere(userId));
  }

  async getCurrentMedicationsByUserId(userId: number) {
    const rows = await this.db
      .select({
        id: schema.userMedication.id,
        brandName: schema.medication.brandName,
        genericName: schema.medication.genericName,
        dosageAmount: schema.userMedication.dosageAmount,
        dosageUnit: schema.userMedication.dosageUnit,
        dosageForm: schema.userMedication.dosageForm,
        frequency: schema.userMedication.frequency,
        instructions: schema.userMedication.instructions,
        updatedAt: schema.userMedication.updatedAt,
        scheduleTime: schema.scheduleTime.time,
        scheduleCreatedAt: schema.scheduleTime.createdAt,
      })
      .from(schema.userMedication)
      .innerJoin(
        schema.medication,
        eq(schema.userMedication.medicationId, schema.medication.id),
      )
      .leftJoin(
        schema.scheduleTime,
        eq(schema.scheduleTime.userMedicationId, schema.userMedication.id),
      )
      .where(this.currentMedicationWhere(userId))
      .orderBy(desc(schema.userMedication.updatedAt), schema.scheduleTime.time);

    const medications = new Map<
      number,
      Omit<(typeof rows)[number], 'scheduleTime' | 'scheduleCreatedAt'> & {
        scheduleTimes: string[];
        scheduleUpdatedAt: Date | null;
      }
    >();

    for (const row of rows) {
      const existing = medications.get(row.id);
      if (existing) {
        if (row.scheduleTime) existing.scheduleTimes.push(row.scheduleTime);
        if (
          row.scheduleCreatedAt &&
          (!existing.scheduleUpdatedAt ||
            row.scheduleCreatedAt > existing.scheduleUpdatedAt)
        ) {
          existing.scheduleUpdatedAt = row.scheduleCreatedAt;
        }
        continue;
      }

      const { scheduleTime, scheduleCreatedAt, ...medication } = row;
      medications.set(row.id, {
        ...medication,
        scheduleTimes: scheduleTime ? [scheduleTime] : [],
        scheduleUpdatedAt: scheduleCreatedAt,
      });
    }

    return [...medications.values()];
  }

  async getLatestMedicationUpdatedAtByUserId(userId: number) {
    const [result] = await this.db
      .select({ updatedAt: max(schema.userMedication.updatedAt) })
      .from(schema.userMedication)
      .where(eq(schema.userMedication.userId, userId));

    return result?.updatedAt ?? null;
  }

  async isActiveMedicationForUser(
    userId: number,
    userMedicationId: number,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.userMedication.id })
      .from(schema.userMedication)
      .where(
        and(
          eq(schema.userMedication.id, userMedicationId),
          eq(schema.userMedication.userId, userId),
          eq(schema.userMedication.status, 'active'),
          eq(schema.userMedication.completion, 'ongoing'),
        ),
      )
      .limit(1);

    return Boolean(row);
  }

  async getUserMedications(
    firebaseUid: string,
    status?: (typeof schema.userMedicationStatusEnum.enumValues)[number],
  ) {
    const userId = await this.getUserIdByFirebaseUid(firebaseUid);

    if (!userId) {
      return [];
    }

    const baseQuery = this.db
      .select({
        id: schema.userMedication.id,
        medicationId: schema.userMedication.medicationId,
        frequency: schema.userMedication.frequency,
        dosageAmount: schema.userMedication.dosageAmount,
        dosageUnit: schema.userMedication.dosageUnit,
        dosageForm: schema.userMedication.dosageForm,
        instructions: schema.userMedication.instructions,
        status: schema.userMedication.status,
        completion: schema.userMedication.completion,
        startDate: schema.userMedication.startDate,
        endDate: schema.userMedication.endDate,
        createdAt: schema.userMedication.createdAt,
        brandName: schema.medication.brandName,
        genericName: schema.medication.genericName,
      })
      .from(schema.userMedication)
      .innerJoin(
        schema.medication,
        eq(schema.userMedication.medicationId, schema.medication.id),
      );

    const statusClause =
      status === 'active'
        ? this.currentMedicationWhere(userId)
        : status
          ? eq(schema.userMedication.status, status)
          : ne(schema.userMedication.status, 'archived');

    return baseQuery
      .where(and(eq(schema.userMedication.userId, userId), statusClause))
      .orderBy(desc(schema.userMedication.createdAt));
  }

  async archiveUserMedication(id: number, firebaseUid: string) {
    const userId = await this.getUserIdByFirebaseUid(firebaseUid);

    if (!userId) {
      throw new NotFoundException(`user medication ${id} was not found`);
    }

    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.userMedication)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(
          and(
            eq(schema.userMedication.id, id),
            eq(schema.userMedication.userId, userId),
          ),
        )
        .returning();

      if (!updated) {
        throw new NotFoundException(`user medication ${id} was not found`);
      }

      await enqueueSafetyInvalidation(tx, {
        userId,
        trigger: 'medication_archived',
        sourceKey: `user-medication:${id}:archived`,
      });

      return updated;
    });
  }

  async insert_user_medication(
    dto: AddMedicationDto,
    params: CreateMedicationParams,
    firebaseUid: string,
  ) {
    const userId = await this.getUserIdByFirebaseUid(firebaseUid);

    if (!userId) {
      throw new NotFoundException('User was not found');
    }

    const result = await this.db.transaction(async (tx) => {
      const { medicationId, newlyVerifiedDailyMedId } =
        await this.resolveMedicationId(tx, dto, params);

      const [userMedication] = await tx
        .insert(schema.userMedication)
        .values({
          userId,
          medicationId,
          frequency: dto.userMedication.frequency,
          dosageAmount: String(dto.userMedication.dosageAmount),
          dosageUnit: dto.userMedication.dosageUnit,
          dosageForm: dto.userMedication.dosageForm,
          instructions: dto.userMedication.instructions,
          ...(dto.userMedication.status
            ? { status: dto.userMedication.status }
            : {}),
          ...(dto.userMedication.completion
            ? { completion: dto.userMedication.completion }
            : {}),
          startDate: params.startDate,
          endDate: params.endDate,
        })
        .returning();

      const scheduleTimes = params.scheduleTimes.length
        ? await tx
            .insert(schema.scheduleTime)
            .values(
              params.scheduleTimes.map((time) => ({
                userMedicationId: userMedication.id,
                time,
              })),
            )
            .returning()
        : [];

      await enqueueSafetyInvalidation(tx, {
        userId,
        trigger: 'medication_added',
        sourceKey: `user-medication:${userMedication.id}:added`,
      });

      return {
        medicationId,
        newlyVerifiedDailyMedId,
        userMedication,
        scheduleTimes,
      };
    });

    // Emitted after the transaction commits, not from inside it — if a
    // later statement in the same transaction had rolled it back, the
    // medication row this event points at would no longer exist.
    if (result.newlyVerifiedDailyMedId) {
      this.medicationEvents.emit({
        medicationId: result.medicationId,
        dailyMedSetId: stripDailyMedPrefix(result.newlyVerifiedDailyMedId),
      });
    }

    return result;
  }

  async updateUserMedication(
    id: number,
    dto: UpdateMedicationDto,
    firebaseUid: string,
  ) {
    const userId = await this.getUserIdByFirebaseUid(firebaseUid);

    if (!userId) {
      throw new NotFoundException(`user medication ${id} was not found`);
    }

    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(schema.userMedication)
        .where(
          and(
            eq(schema.userMedication.id, id),
            eq(schema.userMedication.userId, userId),
          ),
        )
        .limit(1);

      if (!current) {
        throw new NotFoundException(`user medication ${id} was not found`);
      }

      if (current.status === 'archived') {
        throw new ConflictException('Archived medications cannot be updated');
      }

      if (current.completion === 'cancelled') {
        throw new ConflictException('Cancelled medications cannot be updated');
      }

      const userMedicationChanges = {
        ...(dto.frequency !== undefined ? { frequency: dto.frequency } : {}),
        ...(dto.dosageAmount !== undefined
          ? { dosageAmount: String(dto.dosageAmount) }
          : {}),
        ...(dto.dosageUnit !== undefined ? { dosageUnit: dto.dosageUnit } : {}),
        ...(dto.dosageForm !== undefined ? { dosageForm: dto.dosageForm } : {}),
        ...(dto.instructions !== undefined
          ? { instructions: dto.instructions }
          : {}),
        ...(dto.startDate !== undefined ? { startDate: dto.startDate } : {}),
        ...(dto.durationOption !== undefined
          ? { endDate: this.resolveUpdateEndDate(current.startDate, dto) }
          : dto.endDate !== undefined
            ? { endDate: dto.endDate }
            : {}),
      };

      const hasUserMedicationChanges =
        Object.keys(userMedicationChanges).length > 0;
      if (hasUserMedicationChanges) {
        await tx
          .update(schema.userMedication)
          .set({ ...userMedicationChanges, updatedAt: new Date() })
          .where(eq(schema.userMedication.id, id));
      }

      if (dto.scheduleTimes !== undefined) {
        const existingScheduleTimes = await tx
          .select({ time: schema.scheduleTime.time })
          .from(schema.scheduleTime)
          .where(eq(schema.scheduleTime.userMedicationId, id));

        const currentTimes = existingScheduleTimes
          .map(({ time }) => time)
          .sort();
        const requestedTimes = [...dto.scheduleTimes].sort();
        const scheduleChanged =
          currentTimes.length !== requestedTimes.length ||
          currentTimes.some((time, index) => time !== requestedTimes[index]);

        if (scheduleChanged) {
          if (!hasUserMedicationChanges) {
            await tx
              .update(schema.userMedication)
              .set({ updatedAt: new Date() })
              .where(eq(schema.userMedication.id, id));
          }

          await tx
            .delete(schema.scheduleTime)
            .where(eq(schema.scheduleTime.userMedicationId, id));

          if (dto.scheduleTimes.length) {
            await tx.insert(schema.scheduleTime).values(
              dto.scheduleTimes.map((time) => ({
                userMedicationId: id,
                time,
              })),
            );
          }
        }
      }

      const [updated] = await tx
        .select({
          id: schema.userMedication.id,
          medicationId: schema.medication.id,
          brandName: schema.medication.brandName,
          genericName: schema.medication.genericName,
          verified: schema.medication.verified,
          verificationSource: schema.medication.verificationSource,
          verificationStatus: schema.medication.verificationStatus,
          dailyMedId: schema.medication.dailyMedId,
          dosageAmount: schema.userMedication.dosageAmount,
          dosageUnit: schema.userMedication.dosageUnit,
          dosageForm: schema.userMedication.dosageForm,
          frequency: schema.userMedication.frequency,
          instructions: schema.userMedication.instructions,
          startDate: schema.userMedication.startDate,
          endDate: schema.userMedication.endDate,
        })
        .from(schema.userMedication)
        .innerJoin(
          schema.medication,
          eq(schema.userMedication.medicationId, schema.medication.id),
        )
        .where(eq(schema.userMedication.id, id));

      const scheduleTimes = await tx
        .select({ time: schema.scheduleTime.time })
        .from(schema.scheduleTime)
        .where(eq(schema.scheduleTime.userMedicationId, id));

      await enqueueSafetyInvalidation(tx, {
        userId,
        trigger: 'medication_updated',
        sourceKey: `user-medication:${id}:updated`,
      });

      return {
        ...updated,
        scheduleTimes: scheduleTimes.map(({ time }) => time),
      };
    });
  }

  private resolveUpdateEndDate(
    currentStartDate: string,
    dto: UpdateMedicationDto,
  ): string | null {
    if (dto.durationOption === DurationOption.ONGOING) {
      return null;
    }

    const end = new Date(`${dto.startDate ?? currentStartDate}T00:00:00.000Z`);
    switch (dto.durationOption) {
      case DurationOption.THREE_DAYS:
        end.setUTCDate(end.getUTCDate() + 3);
        break;
      case DurationOption.ONE_WEEK:
        end.setUTCDate(end.getUTCDate() + 7);
        break;
      case DurationOption.TWO_WEEKS:
        end.setUTCDate(end.getUTCDate() + 14);
        break;
      case DurationOption.ONE_MONTH:
        end.setUTCMonth(end.getUTCMonth() + 1);
        break;
      case DurationOption.CUSTOM:
        end.setUTCDate(end.getUTCDate() + dto.customDays!);
        break;
    }

    return end.toISOString().slice(0, 10);
  }

  /**
   * newlyVerifiedDailyMedId is set only on the one branch where this call
   * genuinely just inserted a brand-new DailyMed-sourced medication row —
   * never on an existing/concurrent-existing/manual/EXISTING_DB path. The
   * caller uses it to fire MedicationVerifiedEvent exactly once per
   * medication, not once per patient who adds it.
   */
  private async resolveMedicationId(
    tx: Database,
    dto: AddMedicationDto,
    params: Pick<CreateMedicationParams, 'dailyMedId'>,
  ): Promise<{ medicationId: number; newlyVerifiedDailyMedId: string | null }> {
    if (dto.source === MedicationSource.EXISTING_DB) {
      const [row] = await tx
        .select()
        .from(schema.medication)
        .where(eq(schema.medication.id, dto.medication.id!))
        .limit(1);

      if (!row) {
        throw new NotFoundException(
          `medication ${dto.medication.id} was not found`,
        );
      }

      return { medicationId: row.id, newlyVerifiedDailyMedId: null };
    }

    if (dto.source === MedicationSource.DAILYMED) {
      const dailyMedId = params.dailyMedId!;

      const [existing] = await tx
        .select({ id: schema.medication.id })
        .from(schema.medication)
        .where(eq(schema.medication.dailyMedId, dailyMedId))
        .limit(1);

      if (existing) {
        return { medicationId: existing.id, newlyVerifiedDailyMedId: null };
      }

      const [inserted] = await tx
        .insert(schema.medication)
        .values({
          brandName: dto.medication.brandName,
          genericName: dto.medication.genericName,
          verified: 'verified',
          verificationSource: 'dailymed',
          verificationStatus: 'verified',
          dailyMedId,
          description: dto.medication.description,
        })
        .onConflictDoNothing({
          target: schema.medication.dailyMedId,
        })
        .returning({ id: schema.medication.id });

      if (inserted) {
        return {
          medicationId: inserted.id,
          newlyVerifiedDailyMedId: dailyMedId,
        };
      }

      const [concurrentExisting] = await tx
        .select({ id: schema.medication.id })
        .from(schema.medication)
        .where(eq(schema.medication.dailyMedId, dailyMedId))
        .limit(1);

      return {
        medicationId: concurrentExisting.id,
        newlyVerifiedDailyMedId: null,
      };
    }

    if (dto.source === MedicationSource.PALESTINE_MOH) {
      const catalogId = dto.medication.medicationCatalogId!;

      const [existing] = await tx
        .select({ id: schema.medication.id })
        .from(schema.medication)
        .where(eq(schema.medication.medicationCatalogId, catalogId))
        .limit(1);

      if (existing) {
        return {
          medicationId: existing.id,
          newlyVerifiedDailyMedId: null,
        };
      }

      const [catalog] = await tx
        .select()
        .from(schema.medicationCatalog)
        .where(eq(schema.medicationCatalog.id, catalogId))
        .limit(1);

      if (!catalog) {
        throw new NotFoundException(
          `medication catalog entry ${catalogId} was not found`,
        );
      }

      const [inserted] = await tx
        .insert(schema.medication)
        .values({
          brandName: catalog.name,
          medicationCatalogId: catalog.id,
          verified: 'verified',
          verificationSource: 'palestine_moh',
          verificationStatus: 'verified',
          dailyMedId: null,
        })
        .onConflictDoNothing({
          target: schema.medication.medicationCatalogId,
        })
        .returning({ id: schema.medication.id });

      if (inserted) {
        return {
          medicationId: inserted.id,
          newlyVerifiedDailyMedId: null,
        };
      }

      const [concurrent] = await tx
        .select({ id: schema.medication.id })
        .from(schema.medication)
        .where(eq(schema.medication.medicationCatalogId, catalogId))
        .limit(1);

      return {
        medicationId: concurrent.id,
        newlyVerifiedDailyMedId: null,
      };
    }

    if (dto.source === MedicationSource.RXNORM) {
      const [inserted] = await tx
        .insert(schema.medication)
        .values({
          brandName: dto.medication.brandName,
          genericName: dto.medication.genericName,
          verified: 'verified',
          verificationSource: 'rxnorm',
          verificationStatus: 'verified',
          dailyMedId: null,
          rxcui: dto.medication.rxcui!.trim(),
          description: dto.medication.description,
        })
        .returning({ id: schema.medication.id });

      return {
        medicationId: inserted.id,
        newlyVerifiedDailyMedId: null,
      };
    }

    // manual
    const [inserted] = await tx
      .insert(schema.medication)
      .values({
        brandName: dto.medication.brandName,
        genericName: dto.medication.genericName,
        verified: 'non-verified',
        verificationSource: 'manual',
        verificationStatus: 'unresolved',
        dailyMedId: null,
        description: dto.medication.description,
      })
      .returning();

    return { medicationId: inserted.id, newlyVerifiedDailyMedId: null };
  }

  async getSafetyContext(userMedicationId: number) {
    const [context] = await this.db
      .select({
        userId: schema.userMedication.userId,
        medicationId: schema.userMedication.medicationId,
      })
      .from(schema.userMedication)
      .where(eq(schema.userMedication.id, userMedicationId))
      .limit(1);

    return context ?? null;
  }

  async getMedicationById(id: number, firebaseUid: string) {
    const userId = await this.getUserIdByFirebaseUid(firebaseUid);

    if (!userId) {
      throw new NotFoundException(`medication ${id} was not found`);
    }

    const rows = await this.db
      .select({
        medication: { ...getTableColumns(schema.medication) },
        userMedication: { ...getTableColumns(schema.userMedication) },
        scheduleTime: { ...getTableColumns(schema.scheduleTime) },
      })
      .from(schema.medication)
      .leftJoin(
        schema.userMedication,
        eq(schema.userMedication.medicationId, schema.medication.id),
      )
      .leftJoin(
        schema.scheduleTime,
        eq(schema.scheduleTime.userMedicationId, schema.userMedication.id),
      )
      .where(
        and(
          eq(schema.userMedication.id, id),
          eq(schema.userMedication.userId, userId),
        ),
      );

    if (!rows.length) {
      throw new NotFoundException(`medication ${id} was not found`);
    }
    return rows;
  }
}
