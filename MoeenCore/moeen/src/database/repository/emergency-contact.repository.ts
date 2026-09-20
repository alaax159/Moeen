import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../database.constants';
import * as schema from '../schema';

type Database = NodePgDatabase<typeof schema>;
type EmergencyContactTx = Parameters<
  Parameters<Database['transaction']>[0]
>[0];

export type EmergencyContactPatch = {
  name?: string;
  phone?: string;
  relationship?: string;
};

export type DeleteEmergencyContactResult = {
  outcome: 'not_found' | 'last' | 'deleted';
};

@Injectable()
export class EmergencyContactRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Serializes a user's emergency-contact mutations against each other so the
   * count-then-write sequences (auto-primary on create, last-contact guard on
   * delete, unset-then-set on setPrimary) cannot race. Nothing on the
   * authenticated-request hot path locks or writes this row — UserSyncGuard
   * does a plain SELECT — so this only contends with other contact mutations.
   */
  private lockUser(tx: EmergencyContactTx, userId: number) {
    return tx
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .for('update');
  }

  listByUserId(userId: number) {
    return this.db
      .select()
      .from(schema.emergencyContact)
      .where(eq(schema.emergencyContact.userId, userId))
      .orderBy(
        desc(schema.emergencyContact.isPrimary),
        asc(schema.emergencyContact.createdAt),
      );
  }

  async create(
    userId: number,
    values: { name: string; phone: string; relationship?: string },
  ) {
    return this.db.transaction(async (tx) => {
      await this.lockUser(tx, userId);

      const [{ total }] = await tx
        .select({ total: count() })
        .from(schema.emergencyContact)
        .where(eq(schema.emergencyContact.userId, userId));

      const [created] = await tx
        .insert(schema.emergencyContact)
        .values({
          userId,
          name: values.name,
          phone: values.phone,
          relationship: values.relationship,
          isPrimary: total === 0,
        })
        .returning();

      return created;
    });
  }

  async update(userId: number, id: number, patch: EmergencyContactPatch) {
    const [updated] = await this.db
      .update(schema.emergencyContact)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.relationship !== undefined
          ? { relationship: patch.relationship }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.emergencyContact.id, id),
          eq(schema.emergencyContact.userId, userId),
        ),
      )
      .returning();

    return updated;
  }

  async delete(
    userId: number,
    id: number,
  ): Promise<DeleteEmergencyContactResult> {
    return this.db.transaction(async (tx) => {
      await this.lockUser(tx, userId);

      const [target] = await tx
        .select({
          id: schema.emergencyContact.id,
          isPrimary: schema.emergencyContact.isPrimary,
        })
        .from(schema.emergencyContact)
        .where(
          and(
            eq(schema.emergencyContact.id, id),
            eq(schema.emergencyContact.userId, userId),
          ),
        )
        .for('update');

      if (!target) {
        return { outcome: 'not_found' };
      }

      const [{ total }] = await tx
        .select({ total: count() })
        .from(schema.emergencyContact)
        .where(eq(schema.emergencyContact.userId, userId));

      if (total === 1) {
        return { outcome: 'last' };
      }

      await tx
        .delete(schema.emergencyContact)
        .where(eq(schema.emergencyContact.id, id));

      // Keep the "exactly one primary" invariant: if we just removed the
      // primary, promote the oldest remaining contact.
      if (target.isPrimary) {
        const [next] = await tx
          .select({ id: schema.emergencyContact.id })
          .from(schema.emergencyContact)
          .where(eq(schema.emergencyContact.userId, userId))
          .orderBy(asc(schema.emergencyContact.createdAt))
          .limit(1);

        if (next) {
          await tx
            .update(schema.emergencyContact)
            .set({ isPrimary: true, updatedAt: new Date() })
            .where(eq(schema.emergencyContact.id, next.id));
        }
      }

      return { outcome: 'deleted' };
    });
  }

  async setPrimary(userId: number, id: number) {
    return this.db.transaction(async (tx) => {
      await this.lockUser(tx, userId);

      const [target] = await tx
        .select({ id: schema.emergencyContact.id })
        .from(schema.emergencyContact)
        .where(
          and(
            eq(schema.emergencyContact.id, id),
            eq(schema.emergencyContact.userId, userId),
          ),
        )
        .for('update');

      if (!target) {
        return undefined;
      }

      await tx
        .update(schema.emergencyContact)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(
          and(
            eq(schema.emergencyContact.userId, userId),
            eq(schema.emergencyContact.isPrimary, true),
          ),
        );

      const [updated] = await tx
        .update(schema.emergencyContact)
        .set({ isPrimary: true, updatedAt: new Date() })
        .where(eq(schema.emergencyContact.id, id))
        .returning();

      return updated;
    });
  }
}
