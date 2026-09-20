import { readFileSync } from 'fs';
import { join } from 'path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { SafetyWarningRepository } from '../../database/repository/safety-warning.repository';
import * as schema from '../../database/schema';

const CONNECTION =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = CONNECTION.length > 0;

const DRIZZLE_DIR = join(__dirname, '..', '..', '..', 'drizzle');

// DDL only — everything up to any hand-appended data statement.
function ddlStatements(migrationFile: string): string[] {
  return readFileSync(join(DRIZZLE_DIR, migrationFile), 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(
      (statement) =>
        statement.length > 0 && !statement.toUpperCase().startsWith('INSERT'),
    );
}

// Apply a migration's DDL, tolerating "already exists" so the spec works
// whether or not the target DB is fully migrated.
async function applyDdl(pool: Pool, migrationFile: string): Promise<void> {
  for (const statement of ddlStatements(migrationFile)) {
    try {
      await pool.query(statement);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== '42P07' && code !== '42710' && code !== '42P16') throw error;
    }
  }
}

(RUN ? describe : describe.skip)('SafetyWarningRepository concurrency (integration)', () => {
  const pool = new Pool({ connectionString: CONNECTION });
  const db = drizzle(pool, { schema });
  const repo = new SafetyWarningRepository(db as never);

  let userId: number;
  let medicationId: number;
  let userMedicationId: number;

  beforeAll(async () => {
    await pool.query('DROP TABLE IF EXISTS "medication_safety_check" CASCADE');
    await pool.query('DROP TYPE IF EXISTS "medication_safety_check_status"');
    await applyDdl(pool, '0007_medication_safety_warnings.sql');
    await applyDdl(pool, '0015_medication_safety_check.sql');

    userId = (
      await pool.query(
        'INSERT INTO "users" ("firebase_uid") VALUES ($1) RETURNING id',
        [`sw-conc-${Date.now()}`],
      )
    ).rows[0].id;

    medicationId = (
      await pool.query(
        `INSERT INTO "medication" ("brand_name") VALUES ('ConcTest') RETURNING id`,
      )
    ).rows[0].id;

    userMedicationId = (
      await pool.query(
        `INSERT INTO "user_medication"
           ("user_id","medication_id","frequency","dosage_amount","dosage_unit","dosage_form","start_date")
         VALUES ($1,$2,1,'1','tablet','tablet',CURRENT_DATE) RETURNING id`,
        [userId, medicationId],
      )
    ).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM "user_medication" WHERE id = $1', [
      userMedicationId,
    ]);
    await pool.query('DELETE FROM "medication" WHERE id = $1', [medicationId]);
    await pool.query('DELETE FROM "users" WHERE id = $1', [userId]);
    await pool.end();
  });

  afterEach(async () => {
    await pool.query(
      'DELETE FROM "medication_safety_warnings" WHERE user_medication_id = $1',
      [userMedicationId],
    );
    await pool.query(
      'DELETE FROM "medication_safety_check" WHERE user_medication_id = $1',
      [userMedicationId],
    );
  });

  it('two concurrent first-read recomputes leave exactly one active warning set and one check row', async () => {
    const setA = [
      {
        warningType: 'drug_allergy' as const,
        severity: 'high',
        message: 'A: penicillin allergy match',
      },
      {
        warningType: 'drug_condition' as const,
        severity: 'moderate',
        message: 'A: kidney caution',
      },
    ];
    const setB = [
      {
        warningType: 'drug_allergy' as const,
        severity: 'high',
        message: 'B: penicillin allergy match',
      },
    ];

    await Promise.all([
      repo.replaceActiveWarnings(userMedicationId, setA),
      repo.replaceActiveWarnings(userMedicationId, setB),
    ]);

    const active = await pool.query(
      `SELECT message FROM "medication_safety_warnings"
       WHERE user_medication_id = $1 AND is_active = true
       ORDER BY message`,
      [userMedicationId],
    );
    const activeMessages: string[] = active.rows.map((row) => row.message);

    // exactly one writer's set survived — not a merge of both
    expect([
      setA.map((w) => w.message).sort(),
      setB.map((w) => w.message).sort(),
    ]).toContainEqual(activeMessages);

    const checkRows = await pool.query(
      `SELECT status FROM "medication_safety_check" WHERE user_medication_id = $1`,
      [userMedicationId],
    );
    expect(checkRows.rowCount).toBe(1);
    expect(checkRows.rows[0].status).toBe('checked');
  });

  it('replaceActiveWarnings with an empty list still records a checked row (Mohammad #2)', async () => {
    await repo.replaceActiveWarnings(userMedicationId, []);

    const activeCount = await pool.query(
      `SELECT count(*)::int AS n FROM "medication_safety_warnings"
       WHERE user_medication_id = $1 AND is_active = true`,
      [userMedicationId],
    );
    expect(activeCount.rows[0].n).toBe(0);

    const checkRows = await pool.query(
      `SELECT status, checked_at FROM "medication_safety_check" WHERE user_medication_id = $1`,
      [userMedicationId],
    );
    expect(checkRows.rowCount).toBe(1);
    expect(checkRows.rows[0].status).toBe('checked');
    expect(checkRows.rows[0].checked_at).not.toBeNull();
  });

  it('recordFailedCheck flips status to failed without touching checked_at or warnings', async () => {
    await repo.replaceActiveWarnings(userMedicationId, [
      {
        warningType: 'drug_allergy',
        severity: 'high',
        message: 'known-good allergy match',
      },
    ]);
    const afterSuccess = await pool.query(
      `SELECT checked_at FROM "medication_safety_check" WHERE user_medication_id = $1`,
      [userMedicationId],
    );
    const successCheckedAt: Date = afterSuccess.rows[0].checked_at;

    await repo.recordFailedCheck(userMedicationId);

    const afterFailure = await pool.query(
      `SELECT status, checked_at FROM "medication_safety_check" WHERE user_medication_id = $1`,
      [userMedicationId],
    );
    expect(afterFailure.rows[0].status).toBe('failed');
    expect(new Date(afterFailure.rows[0].checked_at).getTime()).toBe(
      new Date(successCheckedAt).getTime(),
    );

    const stillActive = await pool.query(
      `SELECT count(*)::int AS n FROM "medication_safety_warnings"
       WHERE user_medication_id = $1 AND is_active = true`,
      [userMedicationId],
    );
    expect(stillActive.rows[0].n).toBe(1);
  });
});
