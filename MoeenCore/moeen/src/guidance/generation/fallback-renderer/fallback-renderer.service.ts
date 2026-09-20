import { Injectable } from '@nestjs/common';

import type {
  SafetyCheckSeverity,
  SafetyFinding,
  SafetyFindingSeverity,
  SafetyFindingType,
} from '../../contracts';
import {
  DECISION_LINE,
  CHECK_NOT_FULLY_VERIFIED,
  FALLBACK_HEADER,
  FINDING_COPY,
  FINDING_TYPE_ORDER,
  INTENT_REFERRAL,
  MEDICAL_HELP_LINE,
  NO_ANSWER_HERE,
  NOTHING_FLAGGED,
  OVERALL_SEVERITY_WORD,
  REFERRAL_LINE,
  SEVERITY_RANK,
  SEVERITY_WORD,
  UNKNOWN_FINDING_COPY,
} from './fallback-copy';
import type {
  FallbackInput,
  FallbackRendererPort,
  FallbackRendering,
} from './fallback-renderer.port';

interface TypeGroup {
  type: SafetyFindingType;
  count: number;
  /** Highest severity among findings of this type — presentation only. */
  highest: SafetyFindingSeverity;
}

/**
 * The answer a patient gets when no generated answer may be shown: a
 * validator rejection, or a provider that never produced one.
 *
 * Three properties are the whole story, and none of them should be traded
 * away later for a warmer-sounding answer:
 *
 * 1. It is deterministic. Same finding set in, byte-identical text out. No
 *    model, no clock, no randomness, no I/O. That is what makes this the
 *    thing we are willing to show when the generated answer failed.
 *
 * 2. It is total. Every input — no check, no findings, an unknown finding
 *    type, an inconsistent severity — produces text. The patient never
 *    receives an error and never receives silence, so there is no branch here
 *    that throws and none that returns an empty string.
 *
 * 3. It only ever repeats the deterministic layer. The severity it reports is
 *    the engine's resolved value, copied; the finding lines come from a fixed
 *    lexicon keyed by the engine's own type values; the urgency of the
 *    referral is a lookup on that same severity. Nothing here judges anything.
 *
 * On rationale: SafetyFinding.rationale is deliberately NOT rendered.
 * It is free text written for a clinical reader ("Sildenafil is
 * contraindicated with nitrates due to severe hypotension risk") and it has
 * never been through the response rules — putting it in front of a patient
 * would route unvalidated prose around the validator on the exact path that
 * exists because validation failed. The type, the severity and the referral
 * are what a patient can act on anyway. If we later want the specifics, the
 * answer is patient-facing copy per finding type from the engine, not this
 * field.
 */
@Injectable()
export class FallbackRenderer implements FallbackRendererPort {
  render(input: FallbackInput): FallbackRendering {
    const { intent, safety } = input;

    if (!safety) {
      return {
        text: paragraphs([
          NO_ANSWER_HERE,
          INTENT_REFERRAL[intent],
          MEDICAL_HELP_LINE,
          DECISION_LINE,
        ]),
        severity: 'clear',
        describedTypes: [],
      };
    }

    const groups = groupByType(safety.findings);

    if (groups.length === 0) {
      return {
        text: paragraphs([
          safety.severity === 'unverified'
            ? CHECK_NOT_FULLY_VERIFIED
            : NOTHING_FLAGGED,
          ...(safety.severity === 'unverified'
            ? [REFERRAL_LINE.unverified]
            : []),
          INTENT_REFERRAL[intent],
          MEDICAL_HELP_LINE,
          DECISION_LINE,
        ]),
        severity: safety.severity,
        describedTypes: [],
      };
    }

    const findingLines = groups.map(renderGroup).join('\n');

    return {
      text: paragraphs([
        FALLBACK_HEADER,
        ...(safety.coverage.status === 'complete'
          ? []
          : [CHECK_NOT_FULLY_VERIFIED]),
        findingLines,
        ...overallLine(safety.severity),
        REFERRAL_LINE[safety.severity] ?? REFERRAL_LINE.clear,
        MEDICAL_HELP_LINE,
        DECISION_LINE,
      ]),
      severity: safety.severity,
      describedTypes: groups.map((group) => group.type),
    };
  }
}

function paragraphs(parts: readonly string[]): string {
  return parts.filter((part) => part !== '').join('\n\n');
}

/**
 * One line per finding *type*, not per finding.
 *
 * A patient with four interaction findings does not need four near-identical
 * sentences, and — the reason this matters for safety rather than for style —
 * grouping is what bounds the output. Four types is the ceiling, so the
 * rendered text cannot grow past the validator's length bound however many
 * findings the engine resolved.
 */
function groupByType(findings: readonly SafetyFinding[]): TypeGroup[] {
  const groups = new Map<SafetyFindingType, TypeGroup>();

  for (const finding of findings) {
    const existing = groups.get(finding.type);
    if (!existing) {
      groups.set(finding.type, {
        type: finding.type,
        count: 1,
        highest: finding.severity,
      });
      continue;
    }
    existing.count += 1;
    if (rank(finding.severity) > rank(existing.highest)) {
      existing.highest = finding.severity;
    }
  }

  // Severity first, then the fixed type order, so the ordering is a pure
  // function of the finding set and never of the order the engine happened
  // to return it in.
  return [...groups.values()].sort(
    (a, b) =>
      rank(b.highest) - rank(a.highest) ||
      typeOrder(a.type) - typeOrder(b.type),
  );
}

function renderGroup(group: TypeGroup): string {
  const copy = FINDING_COPY[group.type] ?? UNKNOWN_FINDING_COPY;
  const word = SEVERITY_WORD[group.highest];

  // An unrecognised severity value prints nothing rather than printing
  // itself. Everything a patient reads here comes from the lexicon.
  if (!word) return `${copy}.`;

  const detail =
    group.count > 1
      ? `${group.count} findings, highest rated ${word}`
      : `rated ${word}`;

  return `${copy} (${detail}).`;
}

/**
 * Reports the severity the engine resolved for the whole check, verbatim.
 * Never recomputed from the findings above it: if the engine says 'moderate'
 * while carrying a major finding, we say 'moderate', because re-ranking a
 * severity is the one thing this layer may never do. Omitted for 'clear',
 * where the finding lines and the wording would contradict each other.
 */
function overallLine(severity: SafetyCheckSeverity): string[] {
  const word = OVERALL_SEVERITY_WORD[severity as SafetyFindingSeverity];
  return word ? [`Overall, this check is rated ${word}.`] : [];
}

function rank(severity: SafetyCheckSeverity): number {
  return SEVERITY_RANK[severity] ?? 0;
}

function typeOrder(type: SafetyFindingType): number {
  const index = FINDING_TYPE_ORDER.indexOf(type);
  return index === -1 ? FINDING_TYPE_ORDER.length : index;
}
