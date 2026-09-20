import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, relative, sep } from 'path';

const SRC_ROOT = join(__dirname, '..', '..', '..');
const GATEWAY_DIR = join(__dirname);
const RESTRICTED_TOKEN = 'LLM_PROVIDER';

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

function findOffenders(
  rootDir: string,
  ownDir: string,
  token: string,
): string[] {
  const offenders: string[] = [];

  for (const filePath of listTsFiles(rootDir)) {
    const relativePath = relative(ownDir, filePath);
    const isInsideOwnFolder = !relativePath.startsWith(`..${sep}`);

    if (isInsideOwnFolder) {
      continue;
    }

    const content = readFileSync(filePath, 'utf8');

    if (content.includes(token)) {
      offenders.push(relative(rootDir, filePath));
    }
  }

  return offenders;
}

/**
 * ProviderGateway is meant to be the only class permitted to make an
 * outbound model call. Nest module encapsulation is the first line of
 * defense — provider-gateway.module.ts never exports LLM_PROVIDER,
 * so no other module's DI container can resolve it. This test is the
 * automatic backstop: it fails the build if any file outside this folder
 * references that token at all, including code that doesn't go through Nest
 * DI (e.g. importing the symbol directly). Bypassing the gateway therefore
 * requires either widening this module's `exports` array or deleting/editing
 * this spec — both are one-line, obviously reviewable diffs.
 */
describe('provider gateway single-exit-point encapsulation', () => {
  it('LLM_PROVIDER is referenced only from inside provider-gateway', () => {
    const offenders = findOffenders(SRC_ROOT, GATEWAY_DIR, RESTRICTED_TOKEN);
    expect(offenders).toEqual([]);
  });

  it('catches a second outbound call site added anywhere else in the codebase', () => {
    const bypassRoot = mkdtempSync(join(tmpdir(), 'provider-gateway-bypass-'));
    const bypassOwnDir = join(
      bypassRoot,
      'guidance',
      'generation',
      'provider-gateway',
    );
    const bypassOffenderDir = join(bypassRoot, 'some-other-feature');
    mkdirSync(bypassOwnDir, { recursive: true });
    mkdirSync(bypassOffenderDir, { recursive: true });

    // A second call site reaching straight for the raw client, instead of
    // going through ProviderGateway.dispatch() — exactly the bypass this
    // mechanism exists to catch.
    const offenderFile = join(bypassOffenderDir, 'sneaky-caller.ts');
    writeFileSync(
      offenderFile,
      [
        "import { LLM_PROVIDER } from '../guidance/generation/provider-gateway/llm-provider.port';",
        '',
        'export function bypassGateway(container: { get(token: symbol): unknown }) {',
        '  return container.get(LLM_PROVIDER);',
        '}',
        '',
      ].join('\n'),
    );

    try {
      const offenders = findOffenders(
        bypassRoot,
        bypassOwnDir,
        RESTRICTED_TOKEN,
      );
      expect(offenders).toEqual([
        join('some-other-feature', 'sneaky-caller.ts'),
      ]);
    } finally {
      rmSync(bypassRoot, { recursive: true, force: true });
    }
  });
});
