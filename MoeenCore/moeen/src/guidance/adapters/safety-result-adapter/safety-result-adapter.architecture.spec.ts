import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const SRC_ROOT = join(__dirname, '..', '..', '..');
const ADAPTER_DIR = join(__dirname);
const RESTRICTED_TOKEN = 'medicationSafetyWarning';

/**
 * The `medication_safety_warning` table's declared owners: the places allowed
 * to name the Drizzle table directly. Everything else in src/ must reach
 * safety state through SafetyResultAdapter.
 *
 * The list is the architecture boundary written down, and it is deliberately
 * this short:
 *
 * - the schema file *is* the table;
 * - the repository is the single SQL surface over it;
 * - the projection is the single writer that keeps it in step with the
 *   authoritative immutable runs.
 *
 * Adding an entry here widens what may read safety state without going
 * through the adapter, so an addition is an architecture decision and should
 * be argued for in review rather than made to turn this file green.
 */
const DECLARED_OWNERS = [
  'database/schema/medication-safety-warning.schema.ts',
  'database/repository/safety-warning.repository.ts',
  'medication-safety/persistence/safety-warning-projection.ts',
];

function listTsFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...listTsFiles(fullPath));
      continue;
    }

    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

describe('safety engine table encapsulation', () => {
  it('is referenced only from its declared owners and safety-result-adapter', () => {
    const offenders: string[] = [];

    for (const filePath of listTsFiles(SRC_ROOT)) {
      const relativeToAdapter = relative(ADAPTER_DIR, filePath);
      const isInsideAdapterFolder = !relativeToAdapter.startsWith(`..${sep}`);

      if (isInsideAdapterFolder) {
        continue;
      }

      const relativeToSrc = toPosix(relative(SRC_ROOT, filePath));

      if (DECLARED_OWNERS.includes(relativeToSrc)) {
        continue;
      }

      const content = readFileSync(filePath, 'utf8');

      if (content.includes(RESTRICTED_TOKEN)) {
        offenders.push(relativeToSrc);
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * Keeps the allow-list honest. A declared owner that no longer exists, or
   * that no longer touches the table, is an exemption nobody is using — and
   * left in place it silently permits a future file at that path to reach the
   * table without anyone deciding that it may.
   */
  it('declares no owner that has stopped owning the table', () => {
    const stale = DECLARED_OWNERS.filter((owner) => {
      const fullPath = join(SRC_ROOT, ...owner.split('/'));

      return (
        !existsSync(fullPath) ||
        !readFileSync(fullPath, 'utf8').includes(RESTRICTED_TOKEN)
      );
    });

    expect(stale).toEqual([]);
  });
});
