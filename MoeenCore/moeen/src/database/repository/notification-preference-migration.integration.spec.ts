import { readFileSync } from 'fs';
import { join } from 'path';

import { Pool } from 'pg';

const CONNECTION =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = CONNECTION.length > 0;

const MIGRATION_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'drizzle',
  '0021_emergency_contact_sms_preference.sql',
);

const MIGRATION_SQL = readFileSync(MIGRATION_PATH, 'utf8');

describe('0021_emergency_contact_sms_preference migration', () => {
  it('adds the column with a DEFAULT so existing rows backfill without a manual UPDATE', () => {
    expect(MIGRATION_SQL).toMatch(/DEFAULT true NOT NULL/i);
    expect(MIGRATION_SQL).not.toMatch(/UPDATE/i);
  });

  (RUN ? it : it.skip)(
    'backfills every pre-existing notification_prefs row to true (rolled back)',
    async () => {
      const pool = new Pool({ connectionString: CONNECTION });

      try {
        await pool.query('BEGIN');
        // Everything here is rolled back. If this DB is not fully migrated,
        // stand up a minimal notification_prefs so the ALTER under test has a
        // target; a fully-migrated DB keeps its real table (IF NOT EXISTS).
        await pool.query(`
          CREATE TABLE IF NOT EXISTS "notification_prefs" (
            "id" serial PRIMARY KEY NOT NULL,
            "user_id" integer NOT NULL,
            "created_at" timestamp DEFAULT now() NOT NULL,
            "updated_at" timestamp DEFAULT now() NOT NULL
          )
        `);
        // Simulate the pre-migration state within the transaction.
        await pool.query(
          'ALTER TABLE "notification_prefs" DROP COLUMN IF EXISTS "emergency_contact_sms_enabled"',
        );

        const user = await pool.query(
          'INSERT INTO "users" ("firebase_uid") VALUES ($1) RETURNING id',
          [`np-mig-${Date.now()}`],
        );
        const userId = user.rows[0].id;
        await pool.query(
          'INSERT INTO "notification_prefs" ("user_id") VALUES ($1)',
          [userId],
        );

        // Apply the migration statement(s).
        for (const statement of MIGRATION_SQL.split('--> statement-breakpoint')
          .map((s) => s.trim())
          .filter(Boolean)) {
          await pool.query(statement);
        }

        const { rows } = await pool.query(
          'SELECT "emergency_contact_sms_enabled" AS enabled FROM "notification_prefs" WHERE "user_id" = $1',
          [userId],
        );
        expect(rows[0].enabled).toBe(true);
      } finally {
        await pool.query('ROLLBACK');
        await pool.end();
      }
    },
  );
});
