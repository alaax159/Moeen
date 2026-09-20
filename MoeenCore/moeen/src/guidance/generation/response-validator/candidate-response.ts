import { ValidationViolation } from './validation-verdict';

/**
 * The envelope GN-1's shared constraint block requires the model to reply
 * with. Nothing downstream sees raw provider text — it either parses into
 * this shape or it is rejected.
 */
export interface CandidateResponse {
  text: string;
  citationIds: string[];
  /** One exact response sentence and the retrieved excerpts supporting it. */
  grounding: ClaimGrounding[];
}

export interface ClaimGrounding {
  claim: string;
  citationIds: string[];
}

export type ParseResult =
  | { ok: true; candidate: CandidateResponse }
  | { ok: false; violation: ValidationViolation };

const RULE = 'envelope';

/**
 * Strips a single markdown code fence around the object.
 *
 * This is the one leniency in the whole validator, and it is deliberate:
 * fencing a JSON reply is the most common thing a model does that changes
 * nothing about the content's safety. Every other deviation from the
 * templates' "nothing before the JSON object, nothing after it" is a
 * rejection. Delete this function to make parsing maximally strict.
 */
function unfence(raw: string): string {
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/i.exec(raw);
  return fenced ? fenced[1] : raw;
}

export function parseCandidateResponse(rawText: string): ParseResult {
  const source = unfence(rawText).trim();

  if (source === '') {
    return reject('empty_response', 'The provider returned no text at all.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    // Deliberately not salvaged with a regex. A response we cannot parse is a
    // response we cannot check, and an unchecked response is exactly what this
    // story exists to keep away from a patient.
    return reject(
      'malformed_envelope',
      'Response was not valid JSON, so none of the content rules could be applied to it.',
      source.slice(0, 120),
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return reject(
      'malformed_envelope',
      'Response parsed as JSON but was not an object.',
    );
  }

  const envelope = parsed as Record<string, unknown>;

  if (typeof envelope.text !== 'string') {
    return reject(
      'malformed_envelope',
      'Envelope is missing a string "text" field.',
    );
  }

  if (!Array.isArray(envelope.citationIds)) {
    return reject(
      'malformed_envelope',
      'Envelope is missing a "citationIds" array. An absent array is not read as "no citations" — a model that forgot the field may equally have forgotten to cite.',
    );
  }

  if (!envelope.citationIds.every((id) => typeof id === 'string')) {
    return reject(
      'malformed_envelope',
      'citationIds contained a non-string entry.',
    );
  }

  if (!Array.isArray(envelope.grounding)) {
    return reject(
      'malformed_envelope',
      'Envelope is missing a "grounding" array. A global citation list cannot show which claim each excerpt supports.',
    );
  }

  const grounding: ClaimGrounding[] = [];
  for (const entry of envelope.grounding) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return reject(
        'malformed_envelope',
        'grounding contained an entry that was not an object.',
      );
    }
    const claim = (entry as Record<string, unknown>).claim;
    const citationIds = (entry as Record<string, unknown>).citationIds;
    if (typeof claim !== 'string' || claim.trim() === '') {
      return reject(
        'malformed_envelope',
        'Every grounding entry must carry a non-empty string claim.',
      );
    }
    if (
      !Array.isArray(citationIds) ||
      !citationIds.every((id) => typeof id === 'string')
    ) {
      return reject(
        'malformed_envelope',
        'Every grounding entry must carry a citationIds string array.',
      );
    }
    grounding.push({ claim, citationIds });
  }

  const text = envelope.text.trim();
  if (text === '') {
    return reject(
      'empty_response',
      'Envelope parsed but "text" was empty. The patient must never receive silence.',
    );
  }

  return {
    ok: true,
    candidate: { text, citationIds: envelope.citationIds, grounding },
  };
}

function reject(
  code: 'malformed_envelope' | 'empty_response',
  detail: string,
  evidence?: string,
): ParseResult {
  return {
    ok: false,
    violation: { code, rule: RULE, detail, ...(evidence ? { evidence } : {}) },
  };
}
