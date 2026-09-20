import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';

import { emergencyAccess } from '../database/schema/emergency-access.schema';

describe('emergencyAccess schema', () => {
  it('enforces one row per user and the bidirectional token invariant', () => {
    const config = getTableConfig(emergencyAccess);

    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        'emergency_access_user_id_idx',
        'emergency_access_token_hash_idx',
      ]),
    );
    const tokenInvariant = config.checks.find(
      (check) => check.name === 'emergency_access_enabled_token_hash_check',
    );
    expect(tokenInvariant).toBeDefined();
    expect(new PgDialect().sqlToQuery(tokenInvariant!.value).sql).toBe(
      '"emergency_access"."enabled" = ("emergency_access"."token_hash" IS NOT NULL)',
    );
  });

  it.each([
    { enabled: true, tokenHash: 'a'.repeat(64), valid: true },
    { enabled: false, tokenHash: null, valid: true },
    { enabled: true, tokenHash: null, valid: false },
    { enabled: false, tokenHash: 'a'.repeat(64), valid: false },
  ])(
    'validates enabled=$enabled with tokenHash=$tokenHash as $valid',
    ({ enabled, tokenHash, valid }) => {
      expect(enabled === (tokenHash !== null)).toBe(valid);
    },
  );

  it('retains the named database CHECK constraint', () => {
    const config = getTableConfig(emergencyAccess);
    expect(config.checks.map((check) => check.name)).toContain(
      'emergency_access_enabled_token_hash_check',
    );
  });
});
