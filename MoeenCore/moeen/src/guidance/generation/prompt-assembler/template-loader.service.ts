import { readFileSync } from 'fs';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import { PromptAssemblyFailedError } from './prompt-assembly-failed.error';

const TEMPLATES_DIR = join(__dirname, 'templates');

/**
 * Templates are checked out with CRLF on Windows and LF everywhere else
 * (core.autocrlf, and no .gitattributes pinning them). Left alone, that means
 * the same commit produces different prompt bytes per machine — and since
 * prompt_version fingerprints those bytes, the same template stamps a
 * different version on a developer's box than in CI.
 *
 * Normalising at the point of reading fixes both halves at once: every
 * environment sends the model identical bytes, and the fingerprint therefore
 * identifies template content rather than the checkout that produced it.
 */
export function normaliseNewlines(content: string): string {
  return content.replace(/\r\n/g, '\n');
}
const SYSTEM_DELIMITER = '--- SYSTEM ---';
const USER_DELIMITER = '--- USER ---';
const INCLUDE_PATTERN = /\{\{>\s*([\w-]+)\s*\}\}/g;
const MAX_INCLUDE_DEPTH = 5;

export interface LoadedTemplate {
  system: string;
  user: string;
  /** Hash of the composed text, for the prompt version stamp. */
  fingerprint: string;
}

/**
 * Reads template files off disk, resolves their `{{> partial }}` includes and
 * splits them into a system and a user half.
 *
 * Every failure here throws. A template that loses its shared constraint block
 * because a partial was renamed must not quietly become an unconstrained
 * prompt — that is the whole reason the constraints live in one included file
 * rather than three copies.
 */
@Injectable()
export class TemplateLoader {
  private readonly cache = new Map<string, string>();

  /** Composed template text with all includes resolved. Cached — templates ship read-only. */
  loadRaw(templateName: string): string {
    const cached = this.cache.get(templateName);
    if (cached !== undefined) return cached;

    const resolved = this.resolveIncludes(this.readTemplate(templateName));
    this.cache.set(templateName, resolved);
    return resolved;
  }

  loadSections(templateName: string): { system: string; user: string } {
    const content = this.loadRaw(templateName);
    const systemStart = content.indexOf(SYSTEM_DELIMITER);
    const userStart = content.indexOf(USER_DELIMITER);

    if (systemStart === -1 || userStart === -1 || userStart < systemStart) {
      throw new PromptAssemblyFailedError(
        `template "${templateName}" is missing its ${SYSTEM_DELIMITER} / ${USER_DELIMITER} sections`,
      );
    }

    return {
      system: content
        .slice(systemStart + SYSTEM_DELIMITER.length, userStart)
        .trim(),
      user: content.slice(userStart + USER_DELIMITER.length).trim(),
    };
  }

  private readTemplate(templateName: string): string {
    try {
      return normaliseNewlines(
        readFileSync(join(TEMPLATES_DIR, `${templateName}.md`), 'utf8'),
      );
    } catch (cause) {
      // Most likely in a built artifact: nest build does not copy .md files out
      // of src/ unless nest-cli.json declares them as assets.
      throw new PromptAssemblyFailedError(
        `cannot read prompt template "${templateName}.md" from ${TEMPLATES_DIR}: ${String(cause)}`,
      );
    }
  }

  private resolveIncludes(content: string): string {
    let output = content;

    for (let depth = 0; depth < MAX_INCLUDE_DEPTH; depth += 1) {
      if (!INCLUDE_PATTERN.test(output)) return output;
      INCLUDE_PATTERN.lastIndex = 0;
      output = output.replace(INCLUDE_PATTERN, (_marker, partialName: string) =>
        this.readTemplate(partialName),
      );
    }

    INCLUDE_PATTERN.lastIndex = 0;
    throw new PromptAssemblyFailedError(
      `prompt template includes are nested deeper than ${MAX_INCLUDE_DEPTH} levels, or form a cycle`,
    );
  }
}
