import { Injectable } from '@nestjs/common';
import {
  ParsedPrescriptionMedication,
  PrescriptionMedicationParser,
} from './prescription-medication-parser';

const HEADING_PATTERN =
  /^(?<name>[\p{L}][\p{L}\p{N}'’().+\-/ ]{0,100}?)\s+(?<dose>\d+(?:[.,]\d+)?)\s*(?<unit>mcg|μg|ug|mg|g|kg|ml|mL|l|L|units?|iu|%)\b(?<rest>.*)$/iu;

const DOSAGE_FORMS = [
  'tablet',
  'capsule',
  'syrup',
  'solution',
  'injection',
  'cream',
  'ointment',
  'drops',
  'inhaler',
  'suspension',
  'spray',
  'patch',
] as const;

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
};

const INSTRUCTION_VERBS = new Set([
  'take',
  'give',
  'use',
  'apply',
  'inject',
  'inhale',
  'instill',
  'administer',
]);

type MedicationHeading = {
  name: string;
  dose: number | null;
  unit: string | null;
  requiresReview?: boolean;
};

@Injectable()
export class DeterministicPrescriptionMedicationParser implements PrescriptionMedicationParser {
  parse(ocrText: string): ParsedPrescriptionMedication[] {
    const blocks = this.medicationBlocks(ocrText);
    return blocks.map(({ heading, text }) => ({
      ...heading,
      dosageForm: this.dosageForm(text),
      frequency: this.frequency(text),
      duration: this.duration(text),
      times: this.times(text),
      instructions: this.instructions(text),
    }));
  }

  private medicationBlocks(ocrText: string) {
    const blocks: Array<{ heading: MedicationHeading; lines: string[] }> = [];

    for (const rawLine of ocrText.split(/\r?\n/)) {
      const line = rawLine.replace(/\s+/g, ' ').trim();
      if (!line) continue;

      const heading = this.heading(line);
      if (heading) {
        blocks.push({ heading, lines: [line] });
      } else if (blocks.length > 0) {
        blocks.at(-1)!.lines.push(line);
      }
    }

    return blocks.map(({ heading, lines }) => ({
      heading,
      text: lines.join(' '),
    }));
  }

  private heading(line: string): MedicationHeading | null {
    const strengthMatch = line.match(HEADING_PATTERN);
    if (strengthMatch) {
      const rawName = strengthMatch.groups!.name.trim();
      if (INSTRUCTION_VERBS.has(rawName.toLowerCase())) return null;
      const concentration = /^\s*\/\s*\d+(?:[.,]\d+)?\s*mL\b/i.test(
        strengthMatch.groups!.rest,
      );
      return {
        name: this.removeTrailingDosageForm(rawName),
        dose: concentration
          ? null
          : Number(strengthMatch.groups!.dose.replace(',', '.')),
        unit: concentration
          ? null
          : this.normalizeUnit(strengthMatch.groups!.unit),
        ...(concentration ? { requiresReview: true } : {}),
      };
    }

    const forms = DOSAGE_FORMS.join('|');
    const formOnlyMatch = line.match(
      new RegExp(
        `^(?<name>[\\p{L}][\\p{L}\\p{N}'’().+\\-/ ]{0,100}?)\\s+(?:${forms})s?$`,
        'iu',
      ),
    );
    if (!formOnlyMatch) return null;

    const rawName = formOnlyMatch.groups!.name.trim();
    if (INSTRUCTION_VERBS.has(rawName.toLowerCase())) return null;

    return { name: rawName, dose: null, unit: null };
  }

  private removeTrailingDosageForm(name: string): string {
    const forms = DOSAGE_FORMS.join('|');
    return name.replace(new RegExp(`\\s+(?:${forms})s?$`, 'i'), '').trim();
  }

  private normalizeUnit(unit: string): string {
    const lower = unit.toLowerCase();
    if (lower === 'μg' || lower === 'ug') return 'mcg';
    if (lower === 'unit') return 'units';
    return lower;
  }

  private dosageForm(text: string): string | null {
    for (const form of DOSAGE_FORMS) {
      const plural = form === 'drops' ? 'drops' : `${form}s?`;
      if (new RegExp(`\\b${plural}\\b`, 'i').test(text)) return form;
    }
    return null;
  }

  private frequency(text: string): string | null {
    const timesDaily = text.match(
      /\b(\d+|one|two|three|four)\s+times?\s+(?:a\s+day|daily|per\s+day)\b/i,
    );
    if (timesDaily) {
      const rawCount = timesDaily[1].toLowerCase();
      const count = NUMBER_WORDS[rawCount] ?? Number(rawCount);
      return `${count} ${count === 1 ? 'time' : 'times'} daily`;
    }

    const namedDaily = text.match(/\b(once|twice|thrice)\s+daily\b/i);
    if (namedDaily) {
      const count = { once: 1, twice: 2, thrice: 3 }[
        namedDaily[1].toLowerCase()
      ];
      return `${count} ${count === 1 ? 'time' : 'times'} daily`;
    }

    const everyHours = text.match(/\bevery\s+(\d+)\s+hours?\b/i);
    if (everyHours) return `every ${everyHours[1]} hours`;
    if (/\b(?:when|as)\s+needed\b|\bprn\b/i.test(text)) {
      return 'when needed';
    }
    if (/\bonce\s+(?:a\s+day|daily)\b|\bdaily\b/i.test(text)) {
      return '1 time daily';
    }
    return null;
  }

  private duration(text: string): string | null {
    const match = text.match(/\bfor\s+(\d+)\s+(days?|weeks?|months?)\b/i);
    return match ? `${match[1]} ${match[2].toLowerCase()}` : null;
  }

  private times(text: string): string[] {
    const times = new Set<string>();
    const pattern =
      /\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b|\b([01]?\d|2[0-3]):([0-5]\d)\b/gi;

    for (const match of text.matchAll(pattern)) {
      if (match[4] !== undefined) {
        times.add(`${match[4].padStart(2, '0')}:${match[5]}`);
        continue;
      }
      let hour = Number(match[1]);
      const suffix = match[3].toLowerCase();
      if (suffix === 'pm' && hour < 12) hour += 12;
      if (suffix === 'am' && hour === 12) hour = 0;
      times.add(`${String(hour).padStart(2, '0')}:${match[2] ?? '00'}`);
    }
    return [...times];
  }

  private instructions(text: string): string | null {
    const phrases = [
      /\bafter\s+(?:food|meals?)\b/i,
      /\bbefore\s+(?:food|meals?)\b/i,
      /\bbefore\s+breakfast\b/i,
      /\bwith\s+(?:food|meals?)\b/i,
      /\bon\s+an\s+empty\s+stomach\b/i,
      /\bat\s+bedtime\b/i,
      /\b(?:when|as)\s+needed(?:\s+for\s+[\p{L} -]+)?\b/iu,
      /\bprn\b/i,
    ];
    const values = phrases
      .map((pattern) => text.match(pattern)?.[0].toLowerCase())
      .filter((value): value is string => Boolean(value));
    return values.length > 0 ? [...new Set(values)].join('; ') : null;
  }
}
