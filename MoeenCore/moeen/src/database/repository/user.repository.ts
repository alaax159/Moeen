import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../database.constants';
import * as schema from '../schema';

type Database = NodePgDatabase<typeof schema>;

@Injectable()
export class UserRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: Database,
  ) {}

  async getOrCreateUser(
    firebaseUid: string,
    email?: string,
  ): Promise<typeof schema.user.$inferSelect> {
    const [existingUser] = await this.db
      .select()
      .from(schema.user)
      .where(
        eq(
          schema.user.firebaseUid,
          firebaseUid,
        ),
      )
      .limit(1);

    if (existingUser) {
      return existingUser;
    }

    const [createdUser] = await this.db
      .insert(schema.user)
      .values({
        firebaseUid,
        ...(email ? { email } : {}),
      })
      .onConflictDoNothing({
        target: schema.user.firebaseUid,
      })
      .returning();

    if (createdUser) {
      return createdUser;
    }

    const [user] = await this.db
      .select()
      .from(schema.user)
      .where(
        eq(
          schema.user.firebaseUid,
          firebaseUid,
        ),
      )
      .limit(1);

    if (!user) {
      throw new Error(
        'Failed to get or create application user',
      );
    }

    return user;
  }
}