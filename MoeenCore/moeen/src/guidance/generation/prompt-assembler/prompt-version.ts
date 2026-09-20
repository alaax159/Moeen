import { createHash } from 'crypto';
import type { GuidanceIntent } from '../../contracts';
import type { PromptVariant } from './prompt-assembler.port';

/**
 * Bump by hand when the team agrees a prompt change is significant enough to
 * be a new version of the guidance behaviour. Reviewed in a pull request, like
 * the templates themselves.
 */
export const PROMPT_VERSION = 'gn1.2';

const FINGERPRINT_LENGTH = 8;

/**
 * Short content hash of the fully composed template text, before substitution.
 *
 * Newlines are normalised before hashing. TemplateLoader already does this on
 * read, so this is belt and braces — but it is the property the fingerprint
 * lives or dies by. A hash that moves when the same file is checked out on a
 * different operating system is not identifying the template, it is
 * identifying the checkout, and every snapshot in CI would disagree with every
 * snapshot on a Windows machine forever.
 */
export function fingerprintTemplate(composedTemplate: string): string {
  return createHash('sha256')
    .update(composedTemplate.replace(/\r\n/g, '\n'))
    .digest('hex')
    .slice(0, FINGERPRINT_LENGTH);
}

/**
 * The value persisted on GuidanceResponse.promptVersion, e.g.
 * `gn1.2:missed_dose:no-evidence:3f9c1e2a`.
 *
 * The manual version says what the team intended; the fingerprint says which
 * bytes actually produced the answer. Both matter: someone can forget to bump
 * PROMPT_VERSION, but they cannot edit a template without moving the
 * fingerprint. Given a stored patient message, this identifies exactly which
 * prompt text generated it — and the variant records whether the model was
 * working from evidence or was told to refuse.
 */
export function buildPromptVersion(
  intent: GuidanceIntent,
  variant: PromptVariant,
  fingerprint: string,
): string {
  return `${PROMPT_VERSION}:${intent}:${variant}:${fingerprint}`;
}
