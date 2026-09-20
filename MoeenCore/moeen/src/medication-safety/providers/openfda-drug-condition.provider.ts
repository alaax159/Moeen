import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import {
  DrugConditionInput,
  DrugConditionInteraction,
  DrugConditionInteractionProvider,
} from './drug-condition-interaction.provider';

type OpenFdaLabel = {
  warnings?: string[];
  warnings_and_cautions?: string[];
  boxed_warning?: string[];
  contraindications?: string[];
  precautions?: string[];
  general_precautions?: string[];
};

type OpenFdaResponse = {
  meta?: {
    results?: {
      total?: number;
    };
  };
  results?: OpenFdaLabel[];
};

type LabelLookupResult = {
  labels: OpenFdaLabel[];
  exhaustive: boolean;
};

const drugLabelApi = 'https://api.fda.gov/drug/label.json';
const LABEL_FETCH_LIMIT = 100;
const LABEL_SORT = 'effective_time:desc';

// Common ICD-10-CM qualifier words that describe severity/type/status
// rather than the disease itself (e.g. "Unspecified asthma, uncomplicated",
// "Severe persistent asthma, uncomplicated"). Drug labels use plain
// clinical language ("bronchial asthma"), not ICD coding phrasing, so
// stripping these from both ends of the condition name surfaces the core
// disease term for matching.
const ICD_QUALIFIER_WORDS = new Set([
  'unspecified',
  'uncomplicated',
  'complicated',
  'mild',
  'moderate',
  'severe',
  'acute',
  'chronic',
  'persistent',
  'intermittent',
  'primary',
  'secondary',
  'other',
  'status',
  'exacerbation',
]);

@Injectable()
export class OpenFdaDrugConditionProvider implements DrugConditionInteractionProvider {
  private readonly logger = new Logger(OpenFdaDrugConditionProvider.name);

  constructor(private readonly httpService: HttpService) {}

  async checkInteraction(
    input: DrugConditionInput,
  ): Promise<DrugConditionInteraction> {
    const conditionName = input.conditionName;
    const medicationName = input.medicationName;
    let lookup: LabelLookupResult;

    try {
      lookup = await this.getLabels(input);
    } catch (error: unknown) {
      const details = isAxiosError(error)
        ? `axios: code=${error.code} status=${error.response?.status} message=${error.message}`
        : error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
      this.logger.error(
        `openFDA lookup failed for ${medicationName} / ${conditionName}: ${details}`,
      );
      return {
        interacts: null,
        severity: 'unknown',
        message: `Unable to verify ${medicationName} against ${conditionName} because the drug-label service is unavailable`,
        source: 'openfda',
      };
    }

    const { labels, exhaustive } = lookup;

    if (labels.length === 0) {
      return {
        interacts: null,
        severity: 'unknown',
        message: `Unable to verify ${medicationName} against ${conditionName} because no matching drug label was found`,
        source: 'openfda',
      };
    }

    const searchTerms = this.getConditionSearchTerms(conditionName);
    const sections: Array<keyof OpenFdaLabel> = [
      'contraindications',
      'boxed_warning',
      'warnings',
      'warnings_and_cautions',
      'precautions',
      'general_precautions',
    ];
    if (
      searchTerms.length === 0 ||
      !labels.some((label) =>
        sections.some((section) => label[section]?.some((text) => text.trim())),
      )
    ) {
      return {
        interacts: null,
        severity: 'unknown',
        message: `Unable to verify ${medicationName} against ${conditionName} because searchable condition or safety-section text is unavailable`,
        source: 'openfda',
      };
    }
    let strongest: 'contraindicated' | 'major' | 'moderate' | undefined;
    let evidenceContext = '';
    const rank = { moderate: 1, major: 2, contraindicated: 3 };
    for (const label of labels) {
      for (const section of sections) {
        for (const text of label[section] ?? []) {
          // Keep sentence, clause, array-item and label boundaries. A risk in
          // another context must not turn a neutral condition mention into risk.
          for (const context of text.split(
            /[.!?;\n]+|\b(?:but|whereas|however)\b/i,
          )) {
            const severity =
              this.getExplicitRisk(context, searchTerms) ??
              (section === 'contraindications' &&
              this.isContraindicationListEntry(context, searchTerms)
                ? 'contraindicated'
                : undefined);
            if (severity && (!strongest || rank[severity] > rank[strongest])) {
              strongest = severity;
              evidenceContext = context.trim();
            }
          }
        }
      }
    }
    if (strongest) {
      return {
        interacts: true,
        severity: strongest,
        message: `${medicationName}: ${this.formatRiskContext(evidenceContext)}`,
        source: 'openfda',
      };
    }

    if (!exhaustive) {
      // More labels matched this medication name than we fetched — a
      // "no mention" verdict from only the first page isn't conclusive;
      // the actual warning could be on a label we never looked at.
      return {
        interacts: null,
        severity: 'unknown',
        message: `Unable to verify ${medicationName} against ${conditionName} because more matching drug labels exist than could be checked`,
        source: 'openfda',
      };
    }

    // Every matching label was retrieved and searched in full — this is a
    // completed search with no explicit risk, not an "unable to verify". Unlike the
    // fail-safe branches above (network failure, no matching label,
    // non-exhaustive search), interacts must be false here or every
    // medication with no real interaction would still surface a
    // false-positive warning.
    return {
      interacts: false,
      severity: 'none',
      message: `No explicit interaction between ${medicationName} and ${conditionName} was found in the retrieved label sections`,
      source: 'openfda',
    };
  }

  private async getLabels(
    input: DrugConditionInput,
  ): Promise<LabelLookupResult> {
    const medicationName = this.escapeSearchValue(input.medicationName);
    const baseIngredientName = this.stripSaltSuffix(input.medicationName);

    if (input.rxcui) {
      const rxcuiResult = await this.getLabelsForSearch(
        `openfda.rxcui:"${this.escapeSearchValue(input.rxcui)}"`,
      );

      // An RxCUI identifies the exact product/formulation being checked. Do
      // not broaden it to generic-name results when the precise lookup works.
      if (rxcuiResult.labels.length > 0) {
        return rxcuiResult;
      }
    }

    const searches = [
      `(openfda.generic_name:"${medicationName}" OR openfda.brand_name:"${medicationName}")`,
    ];

    if (baseIngredientName && baseIngredientName !== input.medicationName) {
      const escapedBaseName = this.escapeSearchValue(baseIngredientName);
      searches.push(
        `(openfda.generic_name:"${escapedBaseName}" OR openfda.brand_name:"${escapedBaseName}")`,
      );
    }

    const seenLabels = new Set<string>();
    const mergedLabels: OpenFdaLabel[] = [];
    let sawAnyResults = false;
    let exhaustive = true;

    for (const search of searches) {
      const result = await this.getLabelsForSearch(search);
      if (result.labels.length > 0) {
        sawAnyResults = true;
        for (const label of result.labels) {
          const key = JSON.stringify(label);
          if (!seenLabels.has(key)) {
            seenLabels.add(key);
            mergedLabels.push(label);
          }
        }
      }
      exhaustive = exhaustive && result.exhaustive;
    }

    if (!sawAnyResults) {
      return { labels: [], exhaustive: true };
    }

    return { labels: mergedLabels, exhaustive };
  }

  private async getLabelsForSearch(search: string): Promise<LabelLookupResult> {
    const labels: OpenFdaLabel[] = [];
    let skip = 0;

    while (true) {
      try {
        const response = await firstValueFrom(
          this.httpService.get<OpenFdaResponse>(drugLabelApi, {
            params: {
              search,
              limit: LABEL_FETCH_LIMIT,
              skip,
              sort: LABEL_SORT,
            },
            timeout: 8000,
            family: 4,
          }),
        );
        const page = response.data.results ?? [];
        const total = response.data.meta?.results?.total;
        labels.push(...page);
        skip += page.length;

        const exhaustive =
          page.length === 0 ||
          (typeof total === 'number'
            ? skip >= total
            : page.length < LABEL_FETCH_LIMIT);

        if (exhaustive) {
          return { labels, exhaustive: true };
        }
      } catch (error: unknown) {
        if (isAxiosError(error) && error.response?.status === 404) {
          return { labels: [], exhaustive: true };
        }
        throw error;
      }
    }
  }

  private stripSaltSuffix(name: string): string {
    const saltSuffixes = new Set([
      'acetate',
      'anhydrous',
      'besylate',
      'bromide',
      'calcium',
      'chloride',
      'citrate',
      'dihydrate',
      'fumarate',
      'hcl',
      'hydrochloride',
      'hydrobromide',
      'isethionate',
      'maleate',
      'mesylate',
      'monohydrate',
      'nitrate',
      'oxalate',
      'palmitate',
      'pamoate',
      'phosphate',
      'potassium',
      'sodium',
      'stearate',
      'sulfate',
      'tartrate',
      'tosylate',
      'valerate',
    ]);
    const words = name.trim().split(/\s+/).filter(Boolean);

    // Names beginning with a salt cation can be complete compounds, not a
    // drug name followed by a removable salt qualifier (e.g. sodium chloride).
    if (
      words.length > 1 &&
      new Set(['calcium', 'potassium', 'sodium']).has(words[0].toLowerCase())
    ) {
      return words.join(' ');
    }

    let end = words.length;

    while (end > 1 && saltSuffixes.has(words[end - 1].toLowerCase())) {
      end -= 1;
    }

    return words.slice(0, end).join(' ');
  }

  private getConditionSearchTerms(conditionName: string): string[] {
    const normalizedName = this.normalizeText(conditionName);
    const nameWithoutType = normalizedName.replace(/^type [12] /, '');
    const beforeComorbidity = nameWithoutType.split(
      /\b(?:with|without|stage)\b/,
    )[0];
    const terms = [
      normalizedName,
      nameWithoutType,
      normalizedName.split(/\b(?:with|without|stage)\b/)[0],
      beforeComorbidity,
      // Broadest fallback: the core disease term with ICD-10-CM severity/
      // type qualifiers trimmed off both ends, e.g. "unspecified asthma
      // uncomplicated" -> "asthma", or "unspecified asthma with status
      // asthmaticus" -> "asthma". Covers every severity/comorbidity variant
      // of the same underlying condition with one search term.
      this.stripIcdQualifiers(nameWithoutType),
      this.stripIcdQualifiers(beforeComorbidity),
    ]
      .map((term) => term.trim())
      .filter((term) => term.length >= 4);

    return [...new Set(terms)];
  }

  private stripIcdQualifiers(name: string): string {
    const words = name.split(' ').filter(Boolean);

    let start = 0;
    let end = words.length;

    while (start < end && ICD_QUALIFIER_WORDS.has(words[start])) {
      start += 1;
    }

    while (end > start && ICD_QUALIFIER_WORDS.has(words[end - 1])) {
      end -= 1;
    }

    return words.slice(start, end).join(' ');
  }

  private formatRiskContext(context: string): string {
    // Presentation only: detection continues to inspect the original context.
    // Sentence splitting can leave partial numeric cross-references at either
    // end (e.g. "2, 17) • Bronchospasm: ... (4, 5").
    const cleaned = context
      .replace(/\(\s*\d[\d\s, .\-–]*\)|\[\s*\d[\d\s, .\-–]*\]/g, '')
      .replace(/\(\s*\d[\d\s, .\-–]*$|\[\s*\d[\d\s, .\-–]*$/g, '')
      .replace(/^[\s\d, .\-–)\]•●▪]+/, '')
      .replace(
        /^(?:bronchospasm|contraindications|warnings(?: and precautions)?|precautions):\s*/i,
        '',
      )
      .replace(/\s+/g, ' ')
      .trim();
    return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
  }

  private getExplicitRisk(
    context: string,
    searchTerms: string[],
  ): 'contraindicated' | 'major' | 'moderate' | undefined {
    const text = this.normalizeText(context);
    for (const term of searchTerms) {
      // Terms contain only normalized letters, digits and spaces. Word
      // boundaries prevent asthma from matching an unrelated longer word.
      const condition = `\\b${term}\\b(?! like\\b)`;
      const patient =
        '(?:(?:in|for|by) )?(?:(?:patients|people|those) (?:with|having) )?(?:a history of )?(?:bronchial )?';
      const rules: Array<[string, 'contraindicated' | 'major' | 'moderate']> = [
        [
          `(?:contraindicated|should not be used|must not be used) ${patient}${condition}`,
          'contraindicated',
        ],
        [`(?:avoid(?: use)?|not recommended) ${patient}${condition}`, 'major'],
        [
          `(?:use (?:with caution|caution|carefully)|should be used with caution|caution (?:is advised|should be exercised)) ${patient}${condition}`,
          'moderate',
        ],
        [
          `(?:may|can) (?:worsen|exacerbate|aggravate) ${condition}`,
          'moderate',
        ],
        [
          `(?:increased|increases the) risk (?:of |in )${patient}${condition}`,
          'moderate',
        ],
        [
          `${condition} (?:patients |is associated with |may be associated with )?(?:are at |have an )?increased risk`,
          'moderate',
        ],
      ];
      for (const [pattern, severity] of rules) {
        for (const match of text.matchAll(new RegExp(pattern, 'g'))) {
          const prefix = text.slice(Math.max(0, match.index - 60), match.index);
          // Do not promote explicitly negated risk statements to findings.
          if (
            /\b(?:not|never|no|without)(?: \w+){0,4} $/.test(prefix) ||
            /\bno evidence (?:of |that )?(?:\w+ ){0,5}$/.test(prefix)
          )
            continue;
          return severity;
        }
      }
    }
    return undefined;
  }

  private isContraindicationListEntry(
    context: string,
    searchTerms: string[],
  ): boolean {
    const text = this.normalizeText(context)
      .replace(/^(?:contraindications? )/, '')
      .trim();

    // Contraindications are commonly encoded as terse list items such as
    // "Bronchial asthma". Treat only noun-phrase-like entries as section-
    // implied risk; full prose still needs explicit risk wording so neutral
    // statements like "Patients with asthma were included" remain clear.
    if (!text || text.split(' ').length > 8) return false;
    if (
      /\b(?:patient|patients|people|subjects|study|studies|included|reported|history|baseline|trial|observed)\b/.test(
        text,
      )
    ) {
      return false;
    }

    return searchTerms.some((term) =>
      new RegExp(`(?:^| )(?:(?:bronchial|active|severe) )?${term}(?: |$)`).test(
        text,
      ),
    );
  }

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private escapeSearchValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}
