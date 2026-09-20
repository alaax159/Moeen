import type { SafetyCheckSeverity } from '../../../contracts';
import { CandidateResponse } from '../candidate-response';
import {
  StoredFindingSeverity,
  StoredSeverity,
  ValidationContext,
  ValidationRule,
} from '../validation-rule.port';
import { ValidationViolation } from '../validation-verdict';
import { findHits, normalizeForMatching, splitSentences } from './text-utils';

/**
 * Seriousness vocabulary, grouped by the engine severity it corresponds to.
 *
 * The grouping is the rule. A model may say "moderate" about a check the
 * engine resolved as moderate, and may not say it about one the engine
 * resolved as contraindicated — the word is not banned, the mismatch is. That
 * is the difference between a rule enforcing the invariant and a rule
 * enforcing a house style.
 *
 * `clear` covers the vocabulary of nothing-found rather than of mildness,
 * because "no interactions were found" is the exact sentence that contradicts
 * a stored major finding, and it contains no severity adjective at all.
 */
const SEVERITY_VOCABULARY: Record<SafetyCheckSeverity, readonly string[]> = {
  unverified: [
    'unverified',
    String.raw`could\s+not\s+(?:fully\s+)?(?:verify|check|confirm)`,
    String.raw`check\s+(?:was|is)\s+(?:incomplete|unavailable)`,
  ],
  clear: [
    String.raw`no\s+(?:known\s+)?(?:interactions?|conflicts?|clashes|problems?|issues?|concerns?|findings?|warnings?|flags?|cautions?)`,
    String.raw`nothing\s+(?:was\s+)?(?:flagged|found|detected|picked\s+up|of\s+concern)`,
    String.raw`(?:found|flagged|detected|picked\s+up)\s+(?:no|nothing)\b`,
    String.raw`(?:did\s+not|does\s+not|has\s+not)\s+(?:flag|find|detect|pick\s+up)`,
    String.raw`(?:all|everything)\s+(?:is\s+)?(?:clear|fine|ok|okay|good|in\s+order)`,
    String.raw`(?:are|is)\s+(?:safe|fine)\s+(?:to\s+take\s+)?together`,
    'clear',
    'unremarkable',
  ],
  minor: ['minor', 'mild', 'slight', 'small', 'trivial', 'negligible', 'low'],
  moderate: ['moderate', 'medium', 'middling', 'intermediate'],
  major: [
    'major',
    'serious',
    'severe',
    'significant',
    'substantial',
    'important',
    'high',
    'dangerous',
    'hazardous',
  ],
  contraindicated: [
    'contraindicated',
    'contraindication',
    String.raw`(?:must|should|can)\s+not\s+be\s+(?:taken|used|combined)\s+together`,
    String.raw`(?:must|should|can)\s+never\s+be\s+(?:taken|used|combined)`,
    String.raw`never\s+be\s+(?:taken|used|combined)\s+together`,
    String.raw`cannot\s+be\s+(?:taken|used|combined)\s+together`,
    'critical',
    'absolute',
  ],
};

const SEVERITY_ORDER: readonly SafetyCheckSeverity[] = [
  'unverified',
  'clear',
  'minor',
  'moderate',
  'major',
  'contraindicated',
];

/**
 * Phrases that undo a finding without naming a severity at all.
 *
 * Limit 5 of the shared constraint block names these one by one — "never say a
 * finding is unlikely, probably fine, may not apply, might be a false alarm,
 * or can be ignored" — because they are how a model hedges a conclusion it was
 * told not to re-derive. They are a contradiction of any stored finding, so
 * they fire on every severity except 'clear', where there is no finding to
 * undo.
 */
const DISMISSALS: readonly RegExp[] = [
  /\bfalse\s+(?:alarm|positive)\b/gi,
  /\b(?:may|might|probably\s+does)\s+not\s+(?:apply|affect|be\s+relevant)\b/gi,
  /\b(?:can|could|may)\s+(?:safely\s+)?be\s+(?:ignored|disregarded|overlooked|set\s+aside)\b/gi,
  /\b(?:is|are|was|were)\s+(?:probably|likely|most\s+likely)\s+(?:fine|ok|okay|nothing|harmless)\b/gi,
  /\b(?:unlikely|not\s+likely)\s+to\s+(?:matter|affect|apply|be\s+a\s+problem|cause)\b/gi,
  /\bmore\s+of\s+a\s+(?:formality|precaution|technicality)\b/gi,
  /\b(?:over|overly)[\s-]?cautious\b/gi,
  /\bnot\s+(?:really\s+)?(?:a\s+)?(?:real\s+)?(?:concern|problem|issue|worry)\b/gi,
];

/**
 * Phrases that re-rank findings against each other.
 *
 * Also limit 5, and separated out because they are wrong whatever the stored
 * severity is: the engine resolved one severity for the check and gave each
 * finding its own, and comparing two findings is a judgement it never made.
 */
const RE_RANKING: readonly RegExp[] = [
  /\b(?:matters?|counts?|is|are)\s+(?:far\s+|much\s+|a\s+lot\s+)?(?:more|less)\s+(?:important|serious|significant|concerning|urgent)?\b(?:\s+than)?/gi,
  /\bthe\s+(?:main|biggest|most\s+(?:important|serious|concerning))\s+(?:one|finding|concern|issue)\b/gi,
  /\b(?:worry|focus|concentrate)\s+(?:more\s+)?about\s+the\b/gi,
  /\bless\s+(?:of\s+a\s+)?(?:worry|concern|problem|issue)\b/gi,
];

function compile(words: readonly string[]): RegExp {
  return new RegExp(String.raw`\b(?:${words.join('|')})\b`, 'gi');
}

const VOCABULARY_PATTERNS = SEVERITY_ORDER.map((severity) => ({
  severity,
  pattern: compile(SEVERITY_VOCABULARY[severity]),
}));

/**
 * Split only at boundaries that normally introduce a new claim. Keeping plain
 * "and" intact avoids breaking medicine pairs such as "warfarin and aspirin";
 * "and the ..." is a useful boundary for two severity claims in one sentence.
 */
const CLAIM_BOUNDARY =
  /\s*(?:;|\b(?:but|while|whereas|however)\b|\band\s+(?=(?:the|a|an|one|overall|this|that)\b))\s*/gi;

function claimSegments(text: string): string[] {
  return splitSentences(text).flatMap((sentence) =>
    sentence
      .split(CLAIM_BOUNDARY)
      .map((segment) => segment.trim())
      .filter((segment) => segment !== ''),
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function namesFindingType(
  segment: string,
  finding: StoredFindingSeverity,
): boolean {
  const words = finding.type.split('_').map(escapeRegExp).join('[\\s_-]+');
  return new RegExp(String.raw`\b${words}\b`, 'i').test(segment);
}

/**
 * Returns null for an overall/unscoped claim. A boolean result means the text
 * explicitly scoped the severity to a finding and says whether that finding
 * can truthfully carry it.
 */
function findingClaimAllows(
  segment: string,
  severity: SafetyCheckSeverity,
  findings: readonly StoredFindingSeverity[],
): boolean | null {
  // A finding type mentioned as the reason for an overall conclusion does not
  // turn that conclusion into a finding-scoped claim. Require the word
  // "finding" when explicit whole-check language is present.
  const overallClaim =
    /\boverall\b|\b(?:check|result|assessment)\s+(?:is|was|seems?|looks?|has\s+been)\b/i.test(
      segment,
    );
  if (overallClaim && !/\bfinding\b/i.test(segment)) return null;

  const named = findings.filter((finding) =>
    namesFindingType(segment, finding),
  );
  if (named.length > 0) {
    // Conservative when a type has multiple findings: an unqualified claim
    // about that type is truthful only if every matching finding has the rank.
    return named.every((finding) => finding.severity === severity);
  }

  if (!/\bfindings?\b/i.test(segment)) return null;

  if (/\bfindings\b/i.test(segment)) {
    return (
      findings.length > 0 &&
      findings.every((finding) => finding.severity === severity)
    );
  }

  if (/\b(?:a|an|one|another)\s+(?:\w+[\s-]+){0,3}?finding\b/i.test(segment)) {
    return findings.some((finding) => finding.severity === severity);
  }

  return findings.length === 1 && findings[0].severity === severity;
}

/**
 * Rule 5 — never contradict the severity the engine already resolved.
 *
 * This is the one invariant in the day-zero doc with no rule behind it until
 * now, and the red-team case that exposed it — a response calling a
 * contraindicated pair "a minor issue" — was accepted by every other rule in
 * this folder, because there is nothing wrong with that sentence except that
 * it is false.
 *
 * That is what makes this rule different in kind from the four before it. The
 * others read the text and decide whether its *shape* is allowed. This one
 * compares the text against a stored value, so it is the only rule that can
 * tell a true statement from a false one — and the only one that can catch the
 * failure the invariant is most worried about, which is a model quietly
 * downgrading something the deterministic layer already decided was dangerous.
 *
 * Three things it checks:
 *
 * 1. **Seriousness in the wrong scope.** An unqualified or overall claim must
 *    match the resolved check severity. A different rank is allowed only when
 *    the same claim explicitly identifies a finding that carries that rank.
 *
 * 2. **Dismissal.** Undoing a finding — false alarm, may not apply, can be
 *    ignored — whenever a finding exists.
 *
 * 3. **Re-ranking.** Weighing findings against each other, at any severity.
 *
 * Symmetric on purpose. Softening a contraindication is the failure that hurts
 * a patient, and it is the one people think of; escalating a minor finding is
 * the failure that sends a frightened person to an emergency department, and
 * it is equally a severity the engine did not set. Both are rejected.
 */
export class SeverityContradictionRule implements ValidationRule {
  readonly name = 'severity-contradiction';

  check(
    candidate: CandidateResponse,
    context: ValidationContext,
  ): ValidationViolation[] {
    const stored = context.storedSeverity;
    // No check behind this run means there is no stored value to contradict.
    // Not a pass — the rule simply has nothing to compare against.
    if (!stored) return [];

    const text = normalizeForMatching(candidate.text);

    const violations: ValidationViolation[] = [];

    for (const segment of claimSegments(text)) {
      for (const { severity, pattern } of VOCABULARY_PATTERNS) {
        const findingAllows = findingClaimAllows(
          segment,
          severity,
          stored.findings,
        );
        const allowed =
          findingAllows === null ? severity === stored.check : findingAllows;

        if (allowed) continue;
        for (const hit of findHits(segment, pattern)) {
          violations.push({
            code: 'severity_contradiction',
            rule: this.name,
            detail: `Describes ${findingAllows === null ? 'the check' : 'a finding'} as ${severity} by saying "${hit.matched}", but the engine resolved it as ${describe(stored)}.`,
            evidence: hit.evidence,
          });
        }
      }
    }

    if (stored.check !== 'clear') {
      for (const pattern of DISMISSALS) {
        for (const hit of findHits(text, pattern)) {
          violations.push({
            code: 'severity_contradiction',
            rule: this.name,
            detail: `Undoes a finding the engine recorded. Matched "${hit.matched}".`,
            evidence: hit.evidence,
          });
        }
      }
    }

    if (stored.findings.length > 1) {
      for (const pattern of RE_RANKING) {
        for (const hit of findHits(text, pattern)) {
          violations.push({
            code: 'severity_contradiction',
            rule: this.name,
            detail: `Re-ranks the findings against each other, which is a judgement the engine did not make. Matched "${hit.matched}".`,
            evidence: hit.evidence,
          });
        }
      }
    }

    return violations;
  }
}

function describe(stored: StoredSeverity): string {
  const findings = [
    ...new Set(
      stored.findings.map((finding) => `${finding.type}=${finding.severity}`),
    ),
  ];
  return findings.length === 0
    ? stored.check
    : `${stored.check} (findings: ${findings.join(', ')})`;
}
