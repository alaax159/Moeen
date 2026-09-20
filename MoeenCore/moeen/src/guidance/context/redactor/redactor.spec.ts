import { Redactor } from './redactor.service';
import { RedactionContext } from './redaction-context';
import { RedactionFailedError } from './redaction-failed.error';
import { RedactionSubject } from './redactor.port';

describe('Redactor', () => {
  let redactor: Redactor;
  let context: RedactionContext;
  const noOne: RedactionSubject = {};

  beforeEach(() => {
    redactor = new Redactor();
    context = new RedactionContext();
  });

  describe('known-name substitution', () => {
    const subject: RedactionSubject = {
      fullName: 'Jane Doe',
      firstName: 'Jane',
      lastName: 'Doe',
    };

    it('replaces the full name with a placeholder', () => {
      const out = redactor.redact(
        'Jane Doe missed her dose yesterday.',
        subject,
        context,
      );
      expect(out).not.toContain('Jane Doe');
      expect(out).toMatch(/^\[PERSON_1\] missed her dose yesterday\.$/);
    });

    it('collapses full, first and last name variants onto the same placeholder', () => {
      const out = redactor.redact(
        'Jane Doe called. Jane said Doe was fine.',
        subject,
        context,
      );
      const matches = out.match(/\[PERSON_\d+\]/g) ?? [];
      expect(matches).toEqual(['[PERSON_1]', '[PERSON_1]', '[PERSON_1]']);
    });

    it('is case-insensitive', () => {
      const out = redactor.redact('a note about JANE DOE', subject, context);
      expect(out).toBe('a note about [PERSON_1]');
    });

    it('only replaces whole-word matches, not substrings of other words', () => {
      const out = redactor.redact(
        'Janet Doerr asked a question',
        { firstName: 'Jane', lastName: 'Doe' },
        context,
      );
      expect(out).toBe('Janet Doerr asked a question');
    });

    it('leaves text untouched when no subject name is known', () => {
      const out = redactor.redact('Jane Doe missed her dose', noOne, context);
      expect(out).toBe('Jane Doe missed her dose');
    });
  });

  describe('pattern-based redaction', () => {
    it('redacts email addresses', () => {
      const out = redactor.redact(
        'contact me at jane.doe@example.com please',
        noOne,
        context,
      );
      expect(out).toBe('contact me at [EMAIL_1] please');
    });

    it('redacts phone numbers in common formats', () => {
      const out = redactor.redact(
        'call (555) 123-4567 or +1 555 987 6543',
        noOne,
        context,
      );
      expect(out).toBe('call [PHONE_1] or [PHONE_2]');
    });

    it('does not redact short numbers like a dosage strength or a schedule slot', () => {
      const out = redactor.redact(
        'take 500 mg at 08:00 for 10 days',
        noOne,
        context,
      );
      expect(out).toBe('take 500 mg at 08:00 for 10 days');
    });

    it('redacts ISO, slash and month-name dates', () => {
      const out = redactor.redact(
        'missed on 2026-08-15, seen 8/16/2026, follow-up August 20, 2026',
        noOne,
        context,
      );
      expect(out).toBe('missed on [DATE_1], seen [DATE_2], follow-up [DATE_3]');
    });

    it('redacts UUIDs', () => {
      const id = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const out = redactor.redact(`internal ref ${id}`, noOne, context);
      expect(out).toBe('internal ref [ID_1]');
    });
  });

  describe('stable placeholders within one request', () => {
    it('maps the same value to the same placeholder across separate redact() calls sharing a context', () => {
      const first = redactor.redact(
        'email: jane.doe@example.com',
        noOne,
        context,
      );
      const second = redactor.redact(
        'confirm jane.doe@example.com again',
        noOne,
        context,
      );
      expect(first).toContain('[EMAIL_1]');
      expect(second).toContain('[EMAIL_1]');
    });

    it('gives distinct values in the same category distinct, incrementing placeholders', () => {
      const out = redactor.redact(
        'a@example.com and b@example.com',
        noOne,
        context,
      );
      expect(out).toBe('[EMAIL_1] and [EMAIL_2]');
    });

    it('does not carry placeholder numbering across independent contexts', () => {
      const first = redactor.redact(
        'a@example.com',
        noOne,
        new RedactionContext(),
      );
      const second = redactor.redact(
        'a@example.com',
        noOne,
        new RedactionContext(),
      );
      expect(first).toBe('[EMAIL_1]');
      expect(second).toBe('[EMAIL_1]');
    });
  });

  describe('deep payload walking', () => {
    it('redacts strings anywhere in a nested object or array and leaves other types untouched', () => {
      const payload = {
        note: 'contact jane.doe@example.com',
        age: 41,
        active: true,
        middleName: null,
        tags: ['ok', 'call +1 555 123 9999'],
        nested: { rationale: 'seen jane.doe@example.com again' },
      };

      const out = redactor.redact(payload, noOne, context);

      expect(out.note).toBe('contact [EMAIL_1]');
      expect(out.age).toBe(41);
      expect(out.active).toBe(true);
      expect(out.middleName).toBeNull();
      expect(out.tags[0]).toBe('ok');
      expect(out.tags[1]).toBe('call [PHONE_1]');
      expect(out.nested.rationale).toBe('seen [EMAIL_1] again');
    });

    it('passes an undefined optional field through unchanged', () => {
      const payload: { note: string; subjectMedicationId?: number } = {
        note: 'fine',
        subjectMedicationId: undefined,
      };
      const out = redactor.redact(payload, noOne, context);
      expect(out.subjectMedicationId).toBeUndefined();
    });
  });

  describe('abort on failure', () => {
    it('throws RedactionFailedError instead of returning anything for a circular payload', () => {
      const cyclic: Record<string, unknown> = { name: 'ok' };
      cyclic.self = cyclic;

      expect(() => redactor.redact(cyclic as never, noOne, context)).toThrow(
        RedactionFailedError,
      );
    });

    it('throws RedactionFailedError for a value it cannot safely redact rather than passing it through raw', () => {
      const payload = { callback: () => 'not redactable' };

      expect(() => redactor.redact(payload as never, noOne, context)).toThrow(
        RedactionFailedError,
      );
    });
  });
});
