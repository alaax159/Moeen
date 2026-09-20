import { readFileSync } from 'fs';
import { join } from 'path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { EmergencyContactRepository } from '../../database/repository/emergency-contact.repository';
import * as schema from '../../database/schema';

const CONNECTION =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = CONNECTION.length > 0;

const MIGRATION_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'drizzle',
  '0016_emergency_contact.sql',
);

// DDL only — everything up to the hand-appended backfill INSERT.
function ddlStatements(): string[] {
  return readFileSync(MIGRATION_PATH, 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(
      (statement) =>
        statement.length > 0 && !statement.toUpperCase().startsWith('INSERT'),
    );
}

(RUN ? describe : describe.skip)('EmergencyContact (integration)', () => {
  const pool = new Pool({ connectionString: CONNECTION });
  const db = drizzle(pool, { schema });
  const repo = new EmergencyContactRepository(db as never);

  let userId: number;

  beforeAll(async () => {
    await pool.query('DROP TABLE IF EXISTS "emergency_contact" CASCADE');
    for (const statement of ddlStatements()) {
      await pool.query(statement);
    }
    const inserted = await pool.query(
      'INSERT INTO "users" ("firebase_uid") VALUES ($1) RETURNING id',
      [`ec-int-${Date.now()}`],
    );
    userId = inserted.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM "users" WHERE id = $1', [userId]);
    await pool.end();
  });

  afterEach(async () => {
    await pool.query('DELETE FROM "emergency_contact" WHERE user_id = $1', [
      userId,
    ]);
  });

  it('migration creates the table and the partial unique primary index', async () => {
    const table = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'emergency_contact'",
    );
    expect(table.rowCount).toBe(1);

    const index = await pool.query(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'emergency_contact_one_primary_per_user_idx'",
    );
    expect(index.rowCount).toBe(1);
    expect(String(index.rows[0].indexdef).toLowerCase()).toContain('where');
    expect(String(index.rows[0].indexdef).toLowerCase()).toContain('is_primary');
  });

  it('migration is reversible (drop then re-apply)', async () => {
    await pool.query('DROP TABLE "emergency_contact" CASCADE');
    const gone = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'emergency_contact'",
    );
    expect(gone.rowCount).toBe(0);

    for (const statement of ddlStatements()) {
      await pool.query(statement);
    }
    const back = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'emergency_contact'",
    );
    expect(back.rowCount).toBe(1);
  });

  it('the DB rejects a second primary contact for the same user', async () => {
    await pool.query(
      `INSERT INTO "emergency_contact" ("user_id","name","phone","is_primary")
       VALUES ($1,'A','+970599111111',true)`,
      [userId],
    );
    await expect(
      pool.query(
        `INSERT INTO "emergency_contact" ("user_id","name","phone","is_primary")
         VALUES ($1,'B','+970599222222',true)`,
        [userId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('runs the full CRUD flow with first-contact auto-primary and primary switching', async () => {
    const first = await repo.create(userId, {
      name: 'Mum',
      phone: '+970599111111',
    });
    expect(first.isPrimary).toBe(true);

    const second = await repo.create(userId, {
      name: 'Dad',
      phone: '+970599222222',
    });
    expect(second.isPrimary).toBe(false);

    const list = await repo.listByUserId(userId);
    expect(list.map((contact) => contact.id)).toEqual([first.id, second.id]);

    const renamed = await repo.update(userId, second.id, { name: 'Father' });
    expect(renamed?.name).toBe('Father');

    await repo.setPrimary(userId, second.id);
    const afterSwitch = await repo.listByUserId(userId);
    expect(
      afterSwitch
        .filter((contact) => contact.isPrimary)
        .map((contact) => contact.id),
    ).toEqual([second.id]);

    expect(await repo.delete(userId, second.id)).toEqual({ outcome: 'deleted' });
    expect(await repo.delete(userId, first.id)).toEqual({ outcome: 'last' });
  });

  it('promotes the oldest remaining contact when the primary is deleted', async () => {
    const a = await repo.create(userId, { name: 'A', phone: '+970599111111' });
    const b = await repo.create(userId, { name: 'B', phone: '+970599222222' });
    await repo.create(userId, { name: 'C', phone: '+970599333333' });
    await repo.setPrimary(userId, b.id);

    expect(await repo.delete(userId, b.id)).toEqual({ outcome: 'deleted' });

    const remaining = await repo.listByUserId(userId);
    const primaries = remaining.filter((contact) => contact.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].id).toBe(a.id);
  });

  it('concurrent creates for a user with no contacts settle to exactly one primary', async () => {
    // Looped: the create race is timing-sensitive, so a single pass can miss it
    // on the unfixed code. Every round must still yield exactly one primary.
    for (let round = 0; round < 5; round++) {
      await pool.query('DELETE FROM "emergency_contact" WHERE user_id = $1', [
        userId,
      ]);

      const created = await Promise.all([
        repo.create(userId, { name: 'A', phone: '+970599111111' }),
        repo.create(userId, { name: 'B', phone: '+970599222222' }),
      ]);

      expect(created.filter((contact) => contact.isPrimary)).toHaveLength(1);

      const all = await repo.listByUserId(userId);
      expect(all).toHaveLength(2);
      expect(all.filter((contact) => contact.isPrimary)).toHaveLength(1);
    }
  });

  it('concurrent deletes of a two-contact user keep one (409), not both', async () => {
    const a = await repo.create(userId, { name: 'A', phone: '+970599111111' });
    const b = await repo.create(userId, { name: 'B', phone: '+970599222222' });

    const outcomes = (
      await Promise.all([repo.delete(userId, a.id), repo.delete(userId, b.id)])
    )
      .map((result) => result.outcome)
      .sort();

    expect(outcomes).toEqual(['deleted', 'last']);

    const remaining = await repo.listByUserId(userId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].isPrimary).toBe(true);
  });

  it('concurrent setPrimary for two different contacts settle to exactly one primary', async () => {
    await repo.create(userId, { name: 'A', phone: '+970599111111' });
    const b = await repo.create(userId, { name: 'B', phone: '+970599222222' });
    const c = await repo.create(userId, { name: 'C', phone: '+970599333333' });

    await Promise.all([
      repo.setPrimary(userId, b.id),
      repo.setPrimary(userId, c.id),
    ]);

    const primaries = (await repo.listByUserId(userId)).filter(
      (contact) => contact.isPrimary,
    );
    expect(primaries).toHaveLength(1);
    expect([b.id, c.id]).toContain(primaries[0].id);
  });
});
