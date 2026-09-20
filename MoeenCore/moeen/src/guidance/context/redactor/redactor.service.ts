import { Injectable } from '@nestjs/common';
import {
  RedactablePayload,
  RedactionSubject,
  RedactorPort,
} from './redactor.port';
import { RedactionContext } from './redaction-context';
import { RedactionFailedError } from './redaction-failed.error';

const UUID_PATTERN =
  /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

const MONTH_NAMES =
  'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';
const DATE_PATTERN = new RegExp(
  [
    '\\b\\d{4}-\\d{2}-\\d{2}\\b', // ISO: 2026-08-15
    '\\b\\d{1,2}/\\d{1,2}/\\d{2,4}\\b', // 8/15/2026
    `\\b(?:${MONTH_NAMES})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, // August 15, 2026
    `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH_NAMES})\\.?,?\\s+\\d{4}\\b`, // 15 August 2026
  ].join('|'),
  'gi',
);

// Broad candidate match — filtered by digit count below so a dosage number
// like "500" or a schedule slot like "08:00" (colon isn't in the class) never
// qualifies.
const PHONE_CANDIDATE_PATTERN = /\+?\(?\d[\d\s().-]{6,}\d\)?/g;
const MIN_PHONE_DIGITS = 7;

/**
 * Strips names, emails, phone numbers, dates and UUIDs out of a payload
 * before it's allowed to leave the trust boundary. Names are redacted only
 * via exact match against the known RedactionSubject — there's no reliable
 * way to detect an arbitrary name in free text without an NER model, which
 * isn't in this stack, and a wrong guess here is worse than under-redacting
 * a name we didn't know to look for. Everything else has a real format, so
 * it's caught by pattern regardless of whether it was "known" in advance.
 */
@Injectable()
export class Redactor implements RedactorPort {
  redact<T extends RedactablePayload>(
    payload: T,
    subject: RedactionSubject,
    context: RedactionContext,
  ): T {
    return this.redactValue(payload, subject, context, new Set<object>()) as T;
  }

  private redactValue(
    value: RedactablePayload,
    subject: RedactionSubject,
    context: RedactionContext,
    ancestors: Set<object>,
  ): RedactablePayload {
    if (
      value === null ||
      value === undefined ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    if (typeof value === 'string') {
      return this.redactString(value, subject, context);
    }
    if (typeof value !== 'object') {
      throw new RedactionFailedError(
        `cannot redact a value of type "${typeof value}"`,
      );
    }
    if (ancestors.has(value)) {
      throw new RedactionFailedError(
        'circular reference detected while redacting payload',
      );
    }

    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        return value.map((item) =>
          this.redactValue(item, subject, context, ancestors),
        );
      }
      const result: { [key: string]: RedactablePayload } = {};
      for (const [key, entry] of Object.entries(value)) {
        result[key] = this.redactValue(entry, subject, context, ancestors);
      }
      return result;
    } finally {
      ancestors.delete(value);
    }
  }

  private redactString(
    input: string,
    subject: RedactionSubject,
    context: RedactionContext,
  ): string {
    let output = this.redactKnownName(input, subject, context);
    output = output.replace(UUID_PATTERN, (match) =>
      context.placeholderFor('ID', match.toLowerCase()),
    );
    output = output.replace(EMAIL_PATTERN, (match) =>
      context.placeholderFor('EMAIL', match.toLowerCase()),
    );
    output = output.replace(DATE_PATTERN, (match) =>
      context.placeholderFor('DATE', match.toLowerCase()),
    );
    output = this.redactPhones(output, context);
    return output;
  }

  private redactKnownName(
    input: string,
    subject: RedactionSubject,
    context: RedactionContext,
  ): string {
    const variants = [subject.fullName, subject.firstName, subject.lastName]
      .filter((v): v is string => !!v && v.trim().length > 0)
      .sort((a, b) => b.length - a.length); // longest first so "Jane Doe" isn't half-replaced by "Jane"

    let output = input;
    for (const variant of variants) {
      // Same key for every variant of the subject's name — they identify the
      // same person, so they must collapse to the same placeholder or the
      // model would read "Jane" and "Jane Doe" as two different people.
      const placeholder = context.placeholderFor('PERSON', 'subject');
      output = this.replaceWholeWord(output, variant, placeholder);
    }
    return output;
  }

  private redactPhones(input: string, context: RedactionContext): string {
    return input.replace(PHONE_CANDIDATE_PATTERN, (match) => {
      const digits = match.replace(/\D/g, '');
      if (digits.length < MIN_PHONE_DIGITS) return match;
      return context.placeholderFor('PHONE', digits);
    });
  }

  private replaceWholeWord(
    input: string,
    term: string,
    placeholder: string,
  ): string {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return input.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), placeholder);
  }
}
