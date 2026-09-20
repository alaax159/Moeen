import { readFileSync } from 'fs';
import { join } from 'path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { Logger } from '@nestjs/common';

import { EmergencyAccessAuditRepository } from '../database/repository/emergency-access-audit.repository';
import * as schema from '../database/schema';
import { EmergencyAccessAuditReconcilerService } from './emergency-access-audit-reconciler.service';

const CONNECTION =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = CONNECTION.length > 0;

const MIGRATION_PATH = join(
  __dirname,
  '..',
  '..',
  'drizzle',
  '0018_emergency_access_audit.sql',
);

// DDL only — every statement in this migration (CREATE TYPE / TABLE / INDEX /
// FUNCTION / TRIGGER); there is no data statement to skip.
function ddlStatements(): string[] {
  return readFileSync(MIGRATION_PATH, 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(
      (statement) =>
        statement.length > 0 && !statement.toUpperCase().startsWith('INSERT'),
    );
}

(RUN ? describe : describe.skip)('emergency_access_audit (integration)', () => {
  const pool = new Pool({ connectionString: CONNECTION });
  const db = drizzle(pool, { schema });
  const repo = new EmergencyAccessAuditRepository(db as never);

  // Every user seeded by this suite. Deleted in afterAll, after the audit table
  // is dropped — the user_id FK is ON DELETE NO ACTION, so audit rows must be
  // gone first.
  const seedUserIds: number[] = [];

  let userId: number;

  beforeAll(async () => {
    await pool.query('DROP TABLE IF EXISTS "emergency_access_audit" CASCADE');
    await pool.query(
      'DROP FUNCTION IF EXISTS emergency_access_audit_prevent_mutation() CASCADE',
    );
    await pool.query('DROP TYPE IF EXISTS "emergency_access_audit_action"');

    for (const statement of ddlStatements()) {
      await pool.query(statement);
    }

    // The reconciler test reads emergency_access.{version,audit_baseline_version}.
    // Build a minimal stand-in here rather than applying migrations 0014-0019 —
    // the test DB carries only what specs bootstrap, and the reconciler needs
    // just these columns. Mirrors emergency-contacts.integration.spec.ts, which
    // owns its own emergency_contact table.
    await pool.query('DROP TABLE IF EXISTS "emergency_access" CASCADE');
    await pool.query(`
      CREATE TABLE "emergency_access" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL,
        "token_hash" varchar(64),
        "enabled" boolean NOT NULL DEFAULT false,
        "version" integer NOT NULL DEFAULT 1,
        "audit_baseline_version" integer NOT NULL DEFAULT 0,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);

    const inserted = await pool.query(
      'INSERT INTO "users" ("firebase_uid") VALUES ($1) RETURNING id',
      [`eaa-int-${Date.now()}`],
    );
    userId = inserted.rows[0].id;
    seedUserIds.push(userId);
  });

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS "emergency_access_audit" CASCADE');
    await pool.query(
      'DROP FUNCTION IF EXISTS emergency_access_audit_prevent_mutation() CASCADE',
    );
    await pool.query('DROP TYPE IF EXISTS "emergency_access_audit_action"');
    await pool.query('DROP TABLE IF EXISTS "emergency_access" CASCADE');
    for (const uid of seedUserIds) {
      await pool.query('DELETE FROM "users" WHERE id = $1', [uid]);
    }
    await pool.end();
  });

  async function insertRow(
    action: 'enabled' | 'regenerated' | 'disabled',
  ): Promise<number> {
    const row = await pool.query(
      'INSERT INTO "emergency_access_audit" ("user_id", "action") VALUES ($1, $2) RETURNING id',
      [userId, action],
    );
    return row.rows[0].id as number;
  }

  it('migration creates the table with a timestamptz created_at', async () => {
    const column = await pool.query(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'emergency_access_audit' AND column_name = 'created_at'`,
    );
    expect(column.rows[0].data_type).toBe('timestamp with time zone');
  });

  it('the repository appends a row that reads back', async () => {
    await repo.recordAccessEvent(userId, 'regenerated');

    const rows = await pool.query(
      `SELECT action, user_id, created_at FROM "emergency_access_audit"
       WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
      [userId],
    );
    expect(rows.rows[0].action).toBe('regenerated');
    expect(rows.rows[0].user_id).toBe(userId);
    expect(rows.rows[0].created_at).not.toBeNull();
  });

  it('rejects UPDATE (append-only)', async () => {
    const id = await insertRow('enabled');

    await expect(
      pool.query('UPDATE "emergency_access_audit" SET action = $1 WHERE id = $2', [
        'disabled',
        id,
      ]),
    ).rejects.toThrow(/append-only/);
  });

  it('rejects an unguarded DELETE (append-only)', async () => {
    const id = await insertRow('disabled');

    await expect(
      pool.query('DELETE FROM "emergency_access_audit" WHERE id = $1', [id]),
    ).rejects.toThrow(/append-only/);
  });

  it('allows DELETE inside a transaction that opts in via retention_purge', async () => {
    const id = await insertRow('enabled');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "SET LOCAL emergency_access_audit.retention_purge = 'on'",
      );
      await client.query('DELETE FROM "emergency_access_audit" WHERE id = $1', [
        id,
      ]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const remaining = await pool.query(
      'SELECT 1 FROM "emergency_access_audit" WHERE id = $1',
      [id],
    );
    expect(remaining.rowCount).toBe(0);
  });

  describe('reconciler query', () => {
    let balancedUserId: number;
    let shortUserId: number;

    beforeAll(async () => {
      const mk = async (
        version: number,
        baseline: number,
        auditRows: number,
      ): Promise<number> => {
        const u = await pool.query(
          'INSERT INTO "users" ("firebase_uid") VALUES ($1) RETURNING id',
          [`eaa-recon-${version}-${baseline}-${Date.now()}-${Math.random()}`],
        );
        const uid = u.rows[0].id as number;
        await pool.query(
          `INSERT INTO "emergency_access"
             ("user_id","enabled","token_hash","version","audit_baseline_version")
           VALUES ($1,false,NULL,$2,$3)`,
          [uid, version, baseline],
        );
        for (let i = 0; i < auditRows; i += 1) {
          await pool.query(
            'INSERT INTO "emergency_access_audit" ("user_id","action") VALUES ($1,$2)',
            [uid, 'enabled'],
          );
        }
        seedUserIds.push(uid);
        return uid;
      };

      balancedUserId = await mk(4, 1, 3); // expected 3, got 3
      shortUserId = await mk(3, 0, 1); // expected 3, got 1
    });

    it('flags only records whose audit count != version - baseline', async () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const service = new EmergencyAccessAuditReconcilerService(db as never);

      await service.reconcileAuditCounts();

      // Assert before restoring — mockRestore() also clears call history.
      const warnings = warnSpy.mock.calls.map((call) => String(call[0]));
      warnSpy.mockRestore();

      expect(warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            `userId=${shortUserId}: actual=1 expected=3`,
          ),
        ]),
      );
      expect(warnings).not.toEqual(
        expect.arrayContaining([
          expect.stringContaining(`userId=${balancedUserId}`),
        ]),
      );
    });
  });
});
