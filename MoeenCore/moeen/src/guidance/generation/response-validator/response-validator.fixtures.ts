import { ConfigService } from '@nestjs/config';
import { CandidateResponse, ClaimGrounding } from './candidate-response';
import { splitSentences } from './rules/text-utils';
import { ValidationContext } from './validation-rule.port';
import {
  ValidationConfig,
  VALIDATION_CONFIG_DEFAULTS,
} from './validation.config';
import { ResponseValidator } from './response-validator.service';

export function testValidationConfig(
  env: Record<string, string | number> = {},
): ValidationConfig {
  return new ValidationConfig(new ConfigService(env));
}

export function testValidator(
  env: Record<string, string | number> = {},
): ResponseValidator {
  return new ResponseValidator(testValidationConfig(env));
}

export function testContext(
  overrides: Partial<ValidationContext> = {},
): ValidationContext {
  return {
    suppliedCitationIds: ['chunk-a1', 'chunk-b2'],
    maxResponseChars: VALIDATION_CONFIG_DEFAULTS.VALIDATION_MAX_RESPONSE_CHARS,
    storedSeverity: null,
    ...overrides,
  };
}

export function candidate(
  text: string,
  citationIds: string[] = ['chunk-a1'],
  grounding: ClaimGrounding[] = groundEverySentence(text, citationIds),
): CandidateResponse {
  return { text, citationIds, grounding };
}

/** The envelope shape GN-1's templates demand, as a provider would return it. */
export function envelope(
  text: string,
  citationIds: string[] = ['chunk-a1'],
  grounding: ClaimGrounding[] = groundEverySentence(text, citationIds),
): string {
  return JSON.stringify({ text, citationIds, grounding });
}

export function groundEverySentence(
  text: string,
  citationIds: readonly string[],
): ClaimGrounding[] {
  return splitSentences(text).map((claim) => ({
    claim,
    citationIds: [...citationIds],
  }));
}

/**
 * An answer that obeys every constraint: cites a supplied excerpt, names no
 * amount, no frequency and no condition, gives no instruction, and closes
 * with the referral line the templates require.
 *
 * Used as the control in every rule's spec. If a change makes this text fail,
 * the change has broken the validator, not the text.
 */
export const REQUIRED_CLINICIAN_REFERRAL =
  'Whether anything about your medicines should change is a decision for your ' +
  'doctor or pharmacist, so please do ask them.';

export const REQUIRED_MEDICAL_HELP_SIGNPOST =
  'If you feel unwell or something is worrying you, medical help is available now.';

export const REQUIRED_CLOSING = `${REQUIRED_CLINICIAN_REFERRAL} ${REQUIRED_MEDICAL_HELP_SIGNPOST}`;

export const CLEAN_ANSWER =
  'Thanks for asking about this one. The reference material for your medicine ' +
  'explains what it is used for and what to look out for while you are on it, ' +
  'and I have summarised that here in plain terms. ' +
  REQUIRED_CLOSING;
