import { Injectable } from '@nestjs/common';

import type { GuidanceIntent } from '../../contracts';

export type ChatRefusalReason = 'diagnosis' | 'dose_change';

export type ChatClassification =
  | {
      kind: 'guidance';
      intent: Extract<GuidanceIntent, 'medication_question' | 'missed_dose'>;
    }
  | {
      kind: 'refusal';
      reason: ChatRefusalReason;
    };

const DIAGNOSIS_TERM =
  "(?:(?:[a-z][a-z'-]*\\s+){0,2}" +
  '(?:condition|disease|illness|infection|syndrome|cancer|allergy)' +
  '|diabetes|hypertension|asthma|pneumonia|flu|covid(?:-19)?' +
  '|anxiety|depression|migraine|arthritis' +
  '|(?:high|low)\\s+blood\\s+pressure)';

const DIAGNOSIS_PATTERNS: readonly RegExp[] = [
  new RegExp(
    `\\b(?:do|could|might|may)\\s+i\\s+have\\s+(?:an?\\s+)?${DIAGNOSIS_TERM}\\b`,
  ),
  /\bdoes\s+this\s+mean\s+i\s+have\b/,
  /\bwhat\s+(?:condition|disease|illness)\s+do\s+i\s+have\b/,
  /\bwhat(?:'s|\s+is)\s+wrong\s+with\s+me\b/,
  /\bwhat(?:'s|\s+is)\s+my\s+diagnosis\b/,
  /\bdiagnos(?:e|ed|ing)\s+(?:me|this|it)\b/,
  /(?:هل\s+)?(?:عندي|لدي)\s+(?:مرض|حاله)(?:\s|$|[؟?.,،])/,
  /هل\s+انا\s+مصاب/,
  /هل\s+هذا\s+يعني\s+ان\s+(?:عندي|لدي)/,
  /(?:شو|ايش)\s+عندي/,
  /ما\s+(?:هو\s+)?مرضي/,
  /ما\s+تشخيصي/,
  /شخصني/,
  /هل\s+يمكن\s+تشخيص/,
];

const DOSE_CHANGE_PATTERNS: readonly RegExp[] = [
  /\b(?:dose|dosage|medication|medicine|drug|pill|tablet|capsule)\b[\s\S]{0,120}\b(?:can|should|may|could)\s+i\s+(?:increase|decrease|reduce|lower|raise|double|halve|stop|start|skip|adjust|change)\s+(?:it|this|that|the\s+next\s+one|next\s+one)\b/,
  /\b(?:increase|decrease|reduce|lower|raise|double|halve|adjust|change)\s+(?:my\s+|the\s+)?(?:dose|dosage|amount|frequency|schedule)\b/,
  /\b(?:can|should|may|could)\s+i\s+(?:increase|decrease|reduce|lower|raise|double|halve|stop|start|skip|adjust|change)\s+(?:taking\s+|using\s+)?(?:my\s+|the\s+|this\s+|that\s+)?(?:dose|dosage|amount|frequency|schedule|medication|medicine|drug|pill|tablet|capsule|treatment|therapy)\b/,
  /\bwhat\s+should\s+(?:my|the)\s+(?:dose|dosage|amount|frequency|schedule)\s+be\b/,
  /\bwhat\s+(?:dose|dosage|amount)\s+should\s+i\s+take\b/,
  /\bhow\s+(?:much|many)\s+should\s+i\s+take\b/,
  /\bshould\s+i\s+take\s+(?:more|less|an?\s+extra|another|double|half)\b/,
  /\b(?:take|use)\s+(?:double|twice|two\s+doses|an?\s+extra\s+dose)\b/,
  /\b(?:can|should|may|could)\s+i\s+take\s+(?:\d+(?:\.\d+)?|one|two|three|half)\s*(?:mg|mcg|g|ml|tablets?|capsules?|pills?)\b/,
  /(?:ازيد|اقل|اخفف|اضاعف|اغير|اعدل)\s+(?:جرعتي|الجرعه|الكميه|الجدول)/,
  /(?:هل\s+)?(?:اوقف|ابدا|اترك|اتخطي)\s+(?:الدواء|العلاج|الجرعه)/,
  /كم\s+(?:حبه|قرص|جرعه)\s+(?:اخذ|اتناول)/,
  /(?:اخذ|اتناول)\s+(?:جرعتين|حبتين|قرصين)/,
];

const MISSED_DOSE_PATTERNS: readonly RegExp[] = [
  /\b(?:missed|forgot|forgotten)\s+(?:my\s+|a\s+|the\s+)?(?:dose|medication|medicine|pill|tablet)\b/,
  /\b(?:dose|medication|medicine|pill|tablet)\s+(?:was\s+)?missed\b/,
  /نسيت\s+(?:جرعتي|الجرعه|الدواء|الحبه)/,
  /فاتتني\s+الجرعه/,
  /جرعه\s+فائته/,
  /ما\s+اخذت\s+الجرعه/,
  /لم\s+اخذ\s+الجرعه/,
];

@Injectable()
export class ChatIntentClassifier {
  classify(message: string): ChatClassification {
    const normalized = this.normalize(message);

    if (this.matches(normalized, DIAGNOSIS_PATTERNS)) {
      return {
        kind: 'refusal',
        reason: 'diagnosis',
      };
    }

    if (this.matches(normalized, DOSE_CHANGE_PATTERNS)) {
      return {
        kind: 'refusal',
        reason: 'dose_change',
      };
    }

    if (this.matches(normalized, MISSED_DOSE_PATTERNS)) {
      return {
        kind: 'guidance',
        intent: 'missed_dose',
      };
    }

    return {
      kind: 'guidance',
      intent: 'medication_question',
    };
  }

  private matches(message: string, patterns: readonly RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(message));
  }

  private normalize(message: string): string {
    return message
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\u064b-\u065f\u0670]/g, '')
      .replace(/\u0640/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
