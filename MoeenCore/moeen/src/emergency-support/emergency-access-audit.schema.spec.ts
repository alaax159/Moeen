import { getTableConfig } from 'drizzle-orm/pg-core';

import {
  emergencyAccessAudit,
  emergencyAccessAuditActionEnum,
} from '../database/schema/emergency-access-audit.schema';

describe('emergencyAccessAudit schema', () => {
  it('has the three lifecycle actions and nothing else', () => {
    expect([...emergencyAccessAuditActionEnum.enumValues]).toEqual([
      'enabled',
      'regenerated',
      'disabled',
    ]);
  });

  it('indexes user_id for per-user retrieval', () => {
    const config = getTableConfig(emergencyAccessAudit);

    expect(config.indexes.map((index) => index.config.name)).toContain(
      'emergency_access_audit_user_id_idx',
    );
  });

  it('does not cascade-delete with the owning user', () => {
    const config = getTableConfig(emergencyAccessAudit);
    const [fk] = config.foreignKeys;

    expect(fk).toBeDefined();
    expect(fk.onDelete).not.toBe('cascade');
    expect(fk.reference().foreignColumns.map((column) => column.name)).toEqual([
      'id',
    ]);
  });

  it('stores created_at as timestamptz with a default', () => {
    const config = getTableConfig(emergencyAccessAudit);
    const createdAt = config.columns.find(
      (column) => column.name === 'created_at',
    );

    expect(createdAt).toBeDefined();
    expect(createdAt!.notNull).toBe(true);
    expect(createdAt!.hasDefault).toBe(true);
    expect(createdAt!.getSQLType()).toBe('timestamp with time zone');
  });
});
