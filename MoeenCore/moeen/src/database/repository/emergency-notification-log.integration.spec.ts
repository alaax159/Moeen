import { readFileSync } from 'fs';
import { join } from 'path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { EmergencyNotificationLogRepository } from './emergency-notification-log.repository';
import * as schema from '../schema';

const CONNECTION = process.env.TEST_DATABASE_URL ?? '';
const RUN = CONNECTION.length > 0;

const MIGRATION_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'drizzle',
  '0020_emergency_notification_log.sql',
);

// Fresh-slate DDL: drop the table + enum types, then replay the migration
// statements. Only touches objects this migration owns.
function ddlStatements(): string[] {
  const drops = [
    'DROP TABLE IF EXISTS "emergency_notification_log" CASCADE',
    'DROP TYPE IF EXISTS "emergency_notification_event" CASCADE',
    'DROP TYPE IF EXISTS "emergency_notification_status" CASCADE',
  ];

  const migration = readFileSync(MIGRATION_PATH, 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  return [...drops, ...migration];
}

(RUN ? describe : describe.skip)(
  'EmergencyNotificationLog (integration)',
  () => {
    const pool = new Pool({ connectionString: CONNECTION });
    const db = drizzle(pool, { schema });
    const repo = new EmergencyNotificationLogRepository(db as never);

    let userId: number;

    beforeAll(async () => {
      for (const statement of ddlStatements()) {
        await pool.query(statement);
      }
      const inserted = await pool.query(
        'INSERT INTO "users" ("firebase_uid") VALUES ($1) RETURNING id',
        [`enl-int-${Date.now()}`],
      );
      userId = inserted.rows[0].id;
    });

    afterAll(async () => {
      await pool.query('DELETE FROM "users" WHERE id = $1', [userId]);
      await pool.query(
        'DROP TABLE IF EXISTS "emergency_notification_log" CASCADE',
      );
      await pool.query(
        'DROP TYPE IF EXISTS "emergency_notification_event" CASCADE',
      );
      await pool.query(
        'DROP TYPE IF EXISTS "emergency_notification_status" CASCADE',
      );
      await pool.end();
    });

    afterEach(async () => {
      await pool.query(
        'DELETE FROM "emergency_notification_log" WHERE user_id = $1',
        [userId],
      );
    });

    it('record() persists a readable row with sent_at defaulted', async () => {
      const row = await repo.record({
        userId,
        contactId: 123,
        event: 'severe_medication_reaction',
        status: 'failed',
      });

      expect(row.id).toEqual(expect.any(Number));
      expect(row.status).toBe('failed');
      expect(row.contactId).toBe(123);
      expect(row.sentAt).toBeInstanceOf(Date);
    });

    it('findRecentByUserId returns rows at/after the cutoff and ignores older ones', async () => {
      const now = Date.now();
      await pool.query(
        `INSERT INTO "emergency_notification_log"
           ("user_id","contact_id","event","status","sent_at")
         VALUES
           ($1, 1, 'severe_medication_reaction', 'sent', $2),
           ($1, 2, 'severe_medication_reaction', 'sent', $3)`,
        [
          userId,
          new Date(now - 40 * 60_000).toISOString(),
          new Date(now - 10 * 60_000).toISOString(),
        ],
      );

      const cutoff = new Date(now - 30 * 60_000);
      const recent = await repo.findRecentByUserId(userId, cutoff);

      expect(recent).not.toBeNull();
      expect(recent?.contactId).toBe(2);
    });

    it('findRecentByUserId ignores recent failed delivery attempts', async () => {
      const now = Date.now();

      await pool.query(
        `INSERT INTO "emergency_notification_log"
       ("user_id","contact_id","event","status","sent_at")
     VALUES ($1, 1, 'severe_medication_reaction', 'failed', $2)`,
        [userId, new Date(now - 5 * 60_000).toISOString()],
      );

      const cutoff = new Date(now - 30 * 60_000);
      const recent = await repo.findRecentByUserId(userId, cutoff);

      expect(recent).toBeNull();
    });

    it('findRecentByUserId returns null when every row predates the cutoff', async () => {
      await pool.query(
        `INSERT INTO "emergency_notification_log"
           ("user_id","contact_id","event","status","sent_at")
         VALUES ($1, 1, 'severe_medication_reaction', 'sent', $2)`,
        [userId, new Date(Date.now() - 90 * 60_000).toISOString()],
      );

      const cutoff = new Date(Date.now() - 30 * 60_000);
      expect(await repo.findRecentByUserId(userId, cutoff)).toBeNull();
    });

    it('cascades on user delete', async () => {
      const scratch = await pool.query(
        'INSERT INTO "users" ("firebase_uid") VALUES ($1) RETURNING id',
        [`enl-int-cascade-${Date.now()}`],
      );
      const scratchUserId = scratch.rows[0].id;

      await repo.record({
        userId: scratchUserId,
        contactId: 9,
        event: 'severe_medication_reaction',
        status: 'sent',
      });

      await pool.query('DELETE FROM "users" WHERE id = $1', [scratchUserId]);

      const remaining = await pool.query(
        'SELECT 1 FROM "emergency_notification_log" WHERE user_id = $1',
        [scratchUserId],
      );
      expect(remaining.rowCount).toBe(0);
    });
  },
);
