import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { RxNormUnavailableError } from '../rxnorm/rxnorm-unavailable.error';
import { RxNormService } from '../rxnorm/rxnorm.service';
import type {
  DrugInteraction,
  DrugInteractionProvider,
  NormalizedDrug,
} from './drug-interaction-provider';

const SEVERITY_RANK: Record<string, number> = {
  unknown: 0,
  minor: 1,
  moderate: 2,
  major: 3,
};

@Injectable()
export class DdinterCsvProvider implements DrugInteractionProvider {
  private interactionsPromise?: Promise<Map<string, DrugInteraction>>;

  constructor(
    private readonly configService: ConfigService,
    private readonly rxNormService: RxNormService,
  ) {}

  async checkInteraction(
    drugA: NormalizedDrug,
    drugB: NormalizedDrug,
  ): Promise<DrugInteraction | null> {
    let ingredientNamesA: string[];
    let ingredientNamesB: string[];

    try {
      [ingredientNamesA, ingredientNamesB] = await Promise.all([
        this.rxNormService.getIngredientNames(drugA.rxcui),
        this.rxNormService.getIngredientNames(drugB.rxcui),
      ]);
    } catch (error) {
      if (error instanceof RxNormUnavailableError) {
        return {
          severity: 'unknown',
          message:
            'Drug interaction could not be verified because RxNorm is unavailable.',
        };
      }

      throw error;
    }

    if (ingredientNamesA.length === 0 || ingredientNamesB.length === 0) {
      return {
        severity: 'unknown',
        message:
          'Drug interaction could not be verified because an RxNorm ingredient could not be resolved.',
      };
    }

    let interactions: Map<string, DrugInteraction>;

    try {
      interactions = await this.getInteractions();
    } catch {
      return {
        severity: 'unknown',
        message:
          'Drug interaction could not be verified because DDInter reference data is unavailable.',
      };
    }

    let strongestInteraction: DrugInteraction | null = null;

    for (const ingredientA of ingredientNamesA) {
      for (const ingredientB of ingredientNamesB) {
        const interaction = interactions.get(
          this.createPairKey(ingredientA, ingredientB),
        );

        if (!interaction) {
          continue;
        }

        if (
          !strongestInteraction ||
          this.getSeverityRank(interaction.severity) >
            this.getSeverityRank(strongestInteraction.severity)
        ) {
          strongestInteraction = interaction;
        }
      }
    }

    return strongestInteraction;
  }

  private getInteractions(): Promise<Map<string, DrugInteraction>> {
    if (!this.interactionsPromise) {
      this.interactionsPromise = this.loadInteractions().catch(
        (error: unknown) => {
          this.interactionsPromise = undefined;
          throw error;
        },
      );
    }

    return this.interactionsPromise;
  }

  private async loadInteractions(): Promise<Map<string, DrugInteraction>> {
    const configuredDataDir =
      this.configService.get<string>('DDINTER_DATA_DIR') ?? 'data/ddinter';

    const dataDir = resolve(configuredDataDir);

    const files = (await readdir(dataDir))
      .filter((file) => /^ddinter_downloads_code_[a-z]\.csv$/i.test(file))
      .sort();

    if (files.length === 0) {
      throw new Error('No DDInter CSV files were found');
    }

    const interactions = new Map<string, DrugInteraction>();

    for (const file of files) {
      const content = await readFile(resolve(dataDir, file), 'utf8');
      const lines = content.split(/\r?\n/);

      if (lines.length === 0) {
        continue;
      }

      const header = this.parseCsvLine(lines[0].replace(/^\uFEFF/, ''));

      const expectedHeader = [
        'DDInterID_A',
        'Drug_A',
        'DDInterID_B',
        'Drug_B',
        'Level',
      ];

      if (header.join('|') !== expectedHeader.join('|')) {
        throw new Error(`Unexpected DDInter CSV header in ${file}`);
      }

      for (let index = 1; index < lines.length; index += 1) {
        const line = lines[index];

        if (!line.trim()) {
          continue;
        }

        const columns = this.parseCsvLine(line);

        if (columns.length < 5) {
          continue;
        }

        const drugA = columns[1]?.trim();
        const drugB = columns[3]?.trim();
        const rawLevel = columns[4]?.trim();

        if (!drugA || !drugB || !rawLevel) {
          continue;
        }

        const severity = rawLevel.toLowerCase();
        const key = this.createPairKey(drugA, drugB);

        const candidate: DrugInteraction = {
          severity,
          message: `DDInter interaction level between ${drugA} and ${drugB}: ${rawLevel}.`,
        };

        const existing = interactions.get(key);

        if (
          !existing ||
          this.getSeverityRank(candidate.severity) >
            this.getSeverityRank(existing.severity)
        ) {
          interactions.set(key, candidate);
        }
      }
    }

    return interactions;
  }

  private createPairKey(drugA: string, drugB: string): string {
    return [this.normalizeName(drugA), this.normalizeName(drugB)]
      .sort()
      .join('|');
  }

  private normalizeName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private getSeverityRank(severity: string): number {
    return SEVERITY_RANK[severity.toLowerCase()] ?? 0;
  }

  private parseCsvLine(line: string): string[] {
    const values: string[] = [];

    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];

      if (character === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }

        continue;
      }

      if (character === ',' && !inQuotes) {
        values.push(current);
        current = '';
        continue;
      }

      current += character;
    }

    values.push(current);

    return values;
  }
}
