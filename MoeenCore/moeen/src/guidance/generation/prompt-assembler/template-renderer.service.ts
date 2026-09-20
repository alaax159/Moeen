import { Injectable } from '@nestjs/common';
import { PromptAssemblyFailedError } from './prompt-assembly-failed.error';

/** Matches `{{ name }}` but never `{{> partial }}` — includes are resolved before rendering. */
const PLACEHOLDER_PATTERN = /\{\{\s*([^}>]+?)\s*\}\}/g;

/**
 * Substitutes `{{placeholder}}` values into a composed template.
 *
 * A placeholder with no supplied value throws rather than rendering an empty
 * gap. A prompt that reads "Recorded allergies:" followed by nothing is worse
 * than no prompt at all — the model reads it as "no allergies" and answers
 * confidently from a blank.
 */
@Injectable()
export class TemplateRenderer {
  render(template: string, values: Record<string, string>): string {
    return template.replace(
      PLACEHOLDER_PATTERN,
      (_match, rawName: string): string => {
        const name = rawName.trim();
        const value = values[name];

        if (value === undefined) {
          throw new PromptAssemblyFailedError(
            `no value supplied for prompt placeholder "${name}"`,
          );
        }

        return value;
      },
    );
  }
}
