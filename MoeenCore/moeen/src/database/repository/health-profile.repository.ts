import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq, ilike } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../database.constants';
import * as schema from '../schema';
import { SavePersonalInfoDto } from '../../health-profile/dto/save-personal-info.dto';
import {
  CreateAllergyDto,
  CreateChronicConditionDto,
} from '../../health-profile/dto/addAllergiesAndChronicCondition.dto';
import { UpdateKnowledgeStatusDto } from '../../health-profile/dto/update-knowledge-status.dto';
import { enqueueSafetyInvalidation } from '../../medication-safety/invalidation/safety-invalidation.writer';

type Database = NodePgDatabase<typeof schema>;

@Injectable()
export class HealthProfileRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: Database,
  ) {}

  async create(firebaseUid: string) {
    const [currentUser] = await this.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.firebaseUid, firebaseUid))
      .limit(1);

    if (!currentUser) {
      throw new NotFoundException('User was not found');
    }

    const [profile] = await this.db
      .insert(schema.healthProfile)
      .values({ userId: currentUser.id })
      .onConflictDoNothing({ target: schema.healthProfile.userId })
      .returning();

    return profile;
  }

  async findByFirebaseUid(firebaseUid: string) {
    const [currentUser] = await this.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.firebaseUid, firebaseUid))
      .limit(1);

    if (!currentUser) return undefined;

    const [profile] = await this.db
      .select()
      .from(schema.healthProfile)
      .where(eq(schema.healthProfile.userId, currentUser.id))
      .limit(1);

    if (!profile) return undefined;

    return {
      user: currentUser,
      healthProfile: profile,
    };
  }

  async getEmergencyCardProfileByUserId(userId: number) {
    const [profile] = await this.db
      .select({
        firstName: schema.user.firstName,
        lastName: schema.user.lastName,
        dateOfBirth: schema.healthProfile.dateOfBirth,
        gender: schema.healthProfile.gender,
        bloodType: schema.healthProfile.bloodType,
        updatedAt: schema.healthProfile.updatedAt,
      })
      .from(schema.user)
      .leftJoin(
        schema.healthProfile,
        eq(schema.healthProfile.userId, schema.user.id),
      )
      .where(eq(schema.user.id, userId))
      .limit(1);

    return profile;
  }

  async updateKnowledgeStatus(
    firebaseUid: string,
    dto: UpdateKnowledgeStatusDto,
  ) {
    return this.db.transaction(async (tx) => {
      const [currentUser] = await tx
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.firebaseUid, firebaseUid))
        .limit(1);

      if (!currentUser) return undefined;

      const [profile] = await tx
        .update(schema.healthProfile)
        .set({
          allergyKnowledgeStatus: dto.allergyKnowledgeStatus,
          conditionKnowledgeStatus: dto.conditionKnowledgeStatus,
          updatedAt: new Date(),
        })
        .where(eq(schema.healthProfile.userId, currentUser.id))
        .returning({
          allergyKnowledgeStatus: schema.healthProfile.allergyKnowledgeStatus,
          conditionKnowledgeStatus:
            schema.healthProfile.conditionKnowledgeStatus,
        });

      if (profile) {
        await enqueueSafetyInvalidation(tx, {
          userId: currentUser.id,
          trigger: 'knowledge_updated',
          sourceKey: `health-profile:${currentUser.id}:knowledge`,
        });
      }

      return profile;
    });
  }

  async getKnowledgeStatusByUserMedicationId(userMedicationId: number) {
    const [profile] = await this.db
      .select({
        allergyKnowledgeStatus: schema.healthProfile.allergyKnowledgeStatus,
        conditionKnowledgeStatus: schema.healthProfile.conditionKnowledgeStatus,
      })
      .from(schema.userMedication)
      .innerJoin(
        schema.healthProfile,
        eq(schema.userMedication.userId, schema.healthProfile.userId),
      )
      .where(eq(schema.userMedication.id, userMedicationId))
      .limit(1);

    return profile;
  }

  async searchAllergies(searchTerm: string) {
    const terms = await this.db
      .selectDistinct({
        localId: schema.allergyConcept.id,
        externalId: schema.allergyConcept.externalId,
        name: schema.allergyConcept.name,
      })
      .from(schema.allergyConcept)
      .where(ilike(schema.allergyConcept.name, `%${searchTerm}%`))
      .limit(20);

    return terms;
  }

  async searchChronicConditions(searchTerm: string) {
    const terms = await this.db
      .selectDistinct({
        localId: schema.chronicConditionConcept.id,
        externalId: schema.chronicConditionConcept.externalId,
        name: schema.chronicConditionConcept.name,
      })
      .from(schema.chronicConditionConcept)
      .where(ilike(schema.chronicConditionConcept.name, `%${searchTerm}%`))
      .limit(20);

    return terms;
  }

  async savePersonalInfo(
    firebaseUid: string,
    email: string | undefined,
    dto: SavePersonalInfoDto,
  ) {
    return this.db.transaction(async (tx) => {
      const [currentUser] = await tx
        .select()
        .from(schema.user)
        .where(eq(schema.user.firebaseUid, firebaseUid))
        .limit(1);

      if (!currentUser) return undefined;

      const [currentProfile] = await tx
        .select({ id: schema.healthProfile.id })
        .from(schema.healthProfile)
        .where(eq(schema.healthProfile.userId, currentUser.id))
        .limit(1);

      if (!currentProfile) return undefined;

      const updatedAt = new Date();
      const [updatedUser] = await tx
        .update(schema.user)
        .set({
          firstName: dto.firstName,
          lastName: dto.lastName,
          ...(email !== undefined ? { email } : {}),
          updatedAt,
        })
        .where(eq(schema.user.id, currentUser.id))
        .returning();

      const [updatedProfile] = await tx
        .update(schema.healthProfile)
        .set({
          dateOfBirth: dto.dateOfBirth,
          weightKg: String(dto.weightKg),
          heightCm: String(dto.heightCm),
          gender: dto.gender,
          bloodType: dto.bloodType,
          allergyKnowledgeStatus: dto.allergyKnowledgeStatus,
          conditionKnowledgeStatus: dto.conditionKnowledgeStatus,
          ...(dto.emergencyContactPhone !== undefined
            ? { emergencyContactPhone: dto.emergencyContactPhone }
            : {}),
          ...(dto.doctorName !== undefined
            ? { doctorName: dto.doctorName }
            : {}),
          ...(dto.doctorPhone !== undefined
            ? { doctorPhone: dto.doctorPhone }
            : {}),
          updatedAt,
        })
        .where(eq(schema.healthProfile.id, currentProfile.id))
        .returning();

      return { user: updatedUser, healthProfile: updatedProfile };
    });
  }
  async createAllergy(firebaseUid: string, dto: CreateAllergyDto) {
    return this.db.transaction(async (tx) => {
      const [currentUser] = await tx
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.firebaseUid, firebaseUid))
        .limit(1);

      if (!currentUser) return undefined;

      const [conceptByExternalId] = dto.externalId
        ? await tx
            .select()
            .from(schema.allergyConcept)
            .where(eq(schema.allergyConcept.externalId, dto.externalId))
            .limit(1)
        : [];
      const [conceptByName] = conceptByExternalId
        ? []
        : await tx
            .select()
            .from(schema.allergyConcept)
            .where(ilike(schema.allergyConcept.name, dto.name))
            .limit(1);
      let existingConcept = conceptByExternalId ?? conceptByName;

      if (existingConcept && !existingConcept.externalId && dto.externalId) {
        [existingConcept] = await tx
          .update(schema.allergyConcept)
          .set({ externalId: dto.externalId, updatedAt: new Date() })
          .where(eq(schema.allergyConcept.id, existingConcept.id))
          .returning();
      }
      const [createdConcept] = existingConcept
        ? []
        : await tx
            .insert(schema.allergyConcept)
            .values({ name: dto.name, externalId: dto.externalId })
            .returning();
      const concept = existingConcept ?? createdConcept;

      const [existingAllergy] = await tx
        .select({ id: schema.userAllergy.id })
        .from(schema.userAllergy)
        .where(
          and(
            eq(schema.userAllergy.userId, currentUser.id),
            eq(schema.userAllergy.allergyConceptId, concept.id),
          ),
        )
        .limit(1);
      const allergyValues = {
        reaction: dto.reaction,
        severity: dto.severity,
        isActive: dto.isActive ?? true,
        updatedAt: new Date(),
      };
      const [savedAllergy] = existingAllergy
        ? await tx
            .update(schema.userAllergy)
            .set(allergyValues)
            .where(eq(schema.userAllergy.id, existingAllergy.id))
            .returning()
        : await tx
            .insert(schema.userAllergy)
            .values({
              userId: currentUser.id,
              allergyConceptId: concept.id,
              ...allergyValues,
            })
            .returning();

      if (savedAllergy.isActive) {
        await tx
          .update(schema.healthProfile)
          .set({ allergyKnowledgeStatus: 'has_records', updatedAt: new Date() })
          .where(eq(schema.healthProfile.userId, currentUser.id));
      }

      await enqueueSafetyInvalidation(tx, {
        userId: currentUser.id,
        trigger: 'allergy_updated',
        sourceKey: `user-allergy:${savedAllergy.id}:saved`,
      });

      return {
        ...savedAllergy,
        name: concept.name,
        externalId: concept.externalId,
      };
    });
  }

  async getAllergiesByFirebaseUid(firebaseUid: string) {
    const [currentUser] = await this.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.firebaseUid, firebaseUid))
      .limit(1);

    if (!currentUser) return [];

    return this.db
      .select({
        id: schema.userAllergy.id,
        name: schema.allergyConcept.name,
        externalId: schema.allergyConcept.externalId,
        reaction: schema.userAllergy.reaction,
        severity: schema.userAllergy.severity,
        isActive: schema.userAllergy.isActive,
        createdAt: schema.userAllergy.createdAt,
        updatedAt: schema.userAllergy.updatedAt,
      })
      .from(schema.userAllergy)
      .innerJoin(
        schema.allergyConcept,
        eq(schema.userAllergy.allergyConceptId, schema.allergyConcept.id),
      )
      .where(
        and(
          eq(schema.userAllergy.userId, currentUser.id),
          eq(schema.userAllergy.isActive, true),
        ),
      );
  }

  async deactivateAllergy(firebaseUid: string, id: number) {
    return this.db.transaction(async (tx) => {
      const [currentUser] = await tx
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.firebaseUid, firebaseUid))
        .limit(1);

      if (!currentUser) return undefined;

      const [healthProfile] = await tx
        .select({ id: schema.healthProfile.id })
        .from(schema.healthProfile)
        .where(eq(schema.healthProfile.userId, currentUser.id))
        .limit(1)
        .for('update');

      if (!healthProfile) return undefined;

      const [deactivatedAllergy] = await tx
        .update(schema.userAllergy)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(schema.userAllergy.id, id),
            eq(schema.userAllergy.userId, currentUser.id),
          ),
        )
        .returning({
          id: schema.userAllergy.id,
          userId: schema.userAllergy.userId,
        });

      if (!deactivatedAllergy) return undefined;

      const [{ activeAllergyCount }] = await tx
        .select({ activeAllergyCount: count() })
        .from(schema.userAllergy)
        .where(
          and(
            eq(schema.userAllergy.userId, currentUser.id),
            eq(schema.userAllergy.isActive, true),
          ),
        );

      if (activeAllergyCount === 0) {
        await tx
          .update(schema.healthProfile)
          .set({ allergyKnowledgeStatus: 'none_known', updatedAt: new Date() })
          .where(eq(schema.healthProfile.userId, currentUser.id));
      }

      await enqueueSafetyInvalidation(tx, {
        userId: currentUser.id,
        trigger: 'allergy_updated',
        sourceKey: `user-allergy:${deactivatedAllergy.id}:deactivated`,
      });

      return deactivatedAllergy;
    });
  }

  async getActiveAllergiesByUserId(userId: number) {
    return this.db
      .select({
        id: schema.userAllergy.id,
        name: schema.allergyConcept.name,
        severity: schema.userAllergy.severity,
        externalId: schema.allergyConcept.externalId,
      })
      .from(schema.userAllergy)
      .innerJoin(
        schema.allergyConcept,
        eq(schema.userAllergy.allergyConceptId, schema.allergyConcept.id),
      )
      .where(
        and(
          eq(schema.userAllergy.userId, userId),
          eq(schema.userAllergy.isActive, true),
        ),
      );
  }

  async getEmergencyCardActiveAllergiesByUserId(userId: number) {
    return this.db
      .select({
        name: schema.allergyConcept.name,
        reaction: schema.userAllergy.reaction,
        severity: schema.userAllergy.severity,
        updatedAt: schema.userAllergy.updatedAt,
      })
      .from(schema.userAllergy)
      .innerJoin(
        schema.allergyConcept,
        eq(schema.userAllergy.allergyConceptId, schema.allergyConcept.id),
      )
      .where(
        and(
          eq(schema.userAllergy.userId, userId),
          eq(schema.userAllergy.isActive, true),
        ),
      );
  }

  async getActiveChronicConditionsByUserId(userId: number) {
    return this.db
      .select({
        name: schema.chronicConditionConcept.name,
        updatedAt: schema.userChronicCondition.updatedAt,
      })
      .from(schema.userChronicCondition)
      .innerJoin(
        schema.chronicConditionConcept,
        eq(
          schema.userChronicCondition.conditionConceptId,
          schema.chronicConditionConcept.id,
        ),
      )
      .where(
        and(
          eq(schema.userChronicCondition.userId, userId),
          eq(schema.userChronicCondition.isActive, true),
        ),
      );
  }

  async createChronicCondition(
    firebaseUid: string,
    dto: CreateChronicConditionDto,
  ) {
    return this.db.transaction(async (tx) => {
      const [currentUser] = await tx
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.firebaseUid, firebaseUid))
        .limit(1);

      if (!currentUser) return undefined;

      const [conceptByExternalId] = dto.externalId
        ? await tx
            .select()
            .from(schema.chronicConditionConcept)
            .where(
              eq(schema.chronicConditionConcept.externalId, dto.externalId),
            )
            .limit(1)
        : [];
      const [conceptByName] = conceptByExternalId
        ? []
        : await tx
            .select()
            .from(schema.chronicConditionConcept)
            .where(ilike(schema.chronicConditionConcept.name, dto.name))
            .limit(1);
      let existingConcept = conceptByExternalId ?? conceptByName;

      if (existingConcept && !existingConcept.externalId && dto.externalId) {
        [existingConcept] = await tx
          .update(schema.chronicConditionConcept)
          .set({ externalId: dto.externalId, updatedAt: new Date() })
          .where(eq(schema.chronicConditionConcept.id, existingConcept.id))
          .returning();
      }
      const [createdConcept] = existingConcept
        ? []
        : await tx
            .insert(schema.chronicConditionConcept)
            .values({ name: dto.name, externalId: dto.externalId })
            .returning();
      const concept = existingConcept ?? createdConcept;

      const [existingCondition] = await tx
        .select({ id: schema.userChronicCondition.id })
        .from(schema.userChronicCondition)
        .where(
          and(
            eq(schema.userChronicCondition.userId, currentUser.id),
            eq(schema.userChronicCondition.conditionConceptId, concept.id),
          ),
        )
        .limit(1);
      const conditionValues = {
        diagnosisDate: dto.diagnosisDate,
        notes: dto.notes,
        isActive: dto.isActive ?? true,
        updatedAt: new Date(),
      };
      const [savedCondition] = existingCondition
        ? await tx
            .update(schema.userChronicCondition)
            .set(conditionValues)
            .where(eq(schema.userChronicCondition.id, existingCondition.id))
            .returning()
        : await tx
            .insert(schema.userChronicCondition)
            .values({
              userId: currentUser.id,
              conditionConceptId: concept.id,
              ...conditionValues,
            })
            .returning();

      if (savedCondition.isActive) {
        await tx
          .update(schema.healthProfile)
          .set({
            conditionKnowledgeStatus: 'has_records',
            updatedAt: new Date(),
          })
          .where(eq(schema.healthProfile.userId, currentUser.id));
      }

      await enqueueSafetyInvalidation(tx, {
        userId: currentUser.id,
        trigger: 'condition_updated',
        sourceKey: `user-condition:${savedCondition.id}:saved`,
      });

      return {
        ...savedCondition,
        name: concept.name,
        externalId: concept.externalId,
      };
    });
  }

  async getChronicConditionsByFirebaseUid(firebaseUid: string) {
    const [currentUser] = await this.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.firebaseUid, firebaseUid))
      .limit(1);

    if (!currentUser) return [];

    return this.db
      .select({
        id: schema.userChronicCondition.id,
        name: schema.chronicConditionConcept.name,
        externalId: schema.chronicConditionConcept.externalId,
        diagnosisDate: schema.userChronicCondition.diagnosisDate,
        notes: schema.userChronicCondition.notes,
        isActive: schema.userChronicCondition.isActive,
        createdAt: schema.userChronicCondition.createdAt,
        updatedAt: schema.userChronicCondition.updatedAt,
      })
      .from(schema.userChronicCondition)
      .innerJoin(
        schema.chronicConditionConcept,
        eq(
          schema.userChronicCondition.conditionConceptId,
          schema.chronicConditionConcept.id,
        ),
      )
      .where(
        and(
          eq(schema.userChronicCondition.userId, currentUser.id),
          eq(schema.userChronicCondition.isActive, true),
        ),
      );
  }

  async deactivateChronicCondition(firebaseUid: string, id: number) {
    return this.db.transaction(async (tx) => {
      const [currentUser] = await tx
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.firebaseUid, firebaseUid))
        .limit(1);

      if (!currentUser) return undefined;

      const [healthProfile] = await tx
        .select({ id: schema.healthProfile.id })
        .from(schema.healthProfile)
        .where(eq(schema.healthProfile.userId, currentUser.id))
        .limit(1)
        .for('update');

      if (!healthProfile) return undefined;

      const [deactivatedCondition] = await tx
        .update(schema.userChronicCondition)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(schema.userChronicCondition.id, id),
            eq(schema.userChronicCondition.userId, currentUser.id),
          ),
        )
        .returning({
          id: schema.userChronicCondition.id,
          userId: schema.userChronicCondition.userId,
        });

      if (!deactivatedCondition) return undefined;

      const [{ activeConditionCount }] = await tx
        .select({ activeConditionCount: count() })
        .from(schema.userChronicCondition)
        .where(
          and(
            eq(schema.userChronicCondition.userId, currentUser.id),
            eq(schema.userChronicCondition.isActive, true),
          ),
        );

      if (activeConditionCount === 0) {
        await tx
          .update(schema.healthProfile)
          .set({
            conditionKnowledgeStatus: 'none_known',
            updatedAt: new Date(),
          })
          .where(eq(schema.healthProfile.userId, currentUser.id));
      }

      await enqueueSafetyInvalidation(tx, {
        userId: currentUser.id,
        trigger: 'condition_updated',
        sourceKey: `user-condition:${deactivatedCondition.id}:deactivated`,
      });

      return deactivatedCondition;
    });
  }
}
