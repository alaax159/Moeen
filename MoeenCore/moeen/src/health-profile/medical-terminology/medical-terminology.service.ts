import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { HealthProfileRepository } from '../../database/repository/health-profile.repository';

type ClinicalTablesResponse = [
  total: number,
  ids: string[],
  extraFields: unknown,
  displayRows: string[][],
];

type SnomedExpandResponse = {
  expansion?: {
    contains?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
  };
};

type CodeSystem = 'local' | 'snomed' | 'rxnorm' | 'umls' | 'icd10cm';
type MedicalTermSource = 'existing_db' | 'clinical_tables' | 'snomed';

const ALLERGY_EXTERNAL_ID_PATTERN = /^snomed:\d+$/;

const CONDITION_EXTERNAL_ID_PATTERN = /^(icd10cm|snomed):[A-Za-z0-9.-]+$/;

export type MedicalTerm = {
  id: string;
  externalId?: string;
  name: string;
  codeSystem: CodeSystem;
  source: MedicalTermSource;
};

@Injectable()
export class MedicalTerminologyService {
  private readonly logger = new Logger(MedicalTerminologyService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly healthProfileRepository: HealthProfileRepository,
  ) {}

  async searchAllergies(searchTerm: string): Promise<MedicalTerm[]> {
    const [databaseResults, generalAllergies] = await Promise.all([
      this.healthProfileRepository.searchAllergies(searchTerm),
      this.searchSnomedAllergies(searchTerm),
    ]);

    return this.mergeResults(
      databaseResults
        .filter(
          (term) =>
            term.externalId === null ||
            ALLERGY_EXTERNAL_ID_PATTERN.test(term.externalId),
        )
        .map((term) => this.mapDatabaseTerm(term)),
      [generalAllergies],
    );
  }

  async searchChronicConditions(searchTerm: string): Promise<MedicalTerm[]> {
    const [databaseResults, icd10Results] = await Promise.all([
      this.healthProfileRepository.searchChronicConditions(searchTerm),
      this.searchIcd10Conditions(searchTerm),
    ]);

    return this.mergeResults(
      databaseResults
        .filter(
          (term) =>
            term.externalId === null ||
            CONDITION_EXTERNAL_ID_PATTERN.test(term.externalId),
        )
        .map((term) => this.mapDatabaseTerm(term)),
      [icd10Results],
    );
  }

  private searchIcd10Conditions(searchTerm: string): Promise<MedicalTerm[]> {
    return this.searchClinicalTables(
      '/api/icd10cm/v3/search',
      {
        terms: searchTerm,
        sf: 'code,name',
        df: 'code,name',
        maxList: 10,
      },
      'icd10cm',
      (id, row) => ({ id, name: row[1] ?? row[0] ?? id }),
    );
  }

  private async searchClinicalTables(
    path: string,
    params: Record<string, string | number>,
    codeSystem: Extract<CodeSystem, 'rxnorm' | 'icd10cm'>,
    mapResult: (id: string, row: string[]) => { id: string; name: string },
  ): Promise<MedicalTerm[]> {
    const baseUrl = this.configService.get<string>(
      'CLINICAL_TABLES_BASE_URL',
      'https://clinicaltables.nlm.nih.gov',
    );

    try {
      const response = await firstValueFrom(
        this.httpService.get<ClinicalTablesResponse>(`${baseUrl}${path}`, {
          params,
          timeout: 8_000,
          family: 4,
        }),
      );

      const [, ids, , displayRows] = response.data;

      return ids.map((id, index) => ({
        ...mapResult(id, displayRows[index] ?? []),
        externalId: `${codeSystem}:${id}`,
        codeSystem,
        source: 'clinical_tables',
      }));
    } catch (error: unknown) {
      this.logUnavailable('Clinical Tables', error);
      return [];
    }
  }

  private async searchSnomedAllergies(
    searchTerm: string,
  ): Promise<MedicalTerm[]> {
    const configuredBaseUrl = this.configService.get<string>(
      'SNOMED_FHIR_BASE_URL',
      'https://r4.ontoserver.csiro.au/fhir',
    );

    const baseUrl = configuredBaseUrl.replace(/\/+$/, '');
    const valueSetUrl = 'http://snomed.info/sct?fhir_vs=isa/420134006';

    try {
      const response = await firstValueFrom(
        this.httpService.get<SnomedExpandResponse>(
          `${baseUrl}/ValueSet/$expand`,
          {
            params: {
              url: valueSetUrl,
              filter: searchTerm,
              count: 10,
              activeOnly: true,
              _format: 'json',
            },
            timeout: 8_000,
            family: 4,
          },
        ),
      );

      return (response.data.expansion?.contains ?? []).flatMap((result) => {
        if (
          result.system !== 'http://snomed.info/sct' ||
          !result.code ||
          !result.display
        ) {
          return [];
        }

        return [
          {
            id: result.code,
            externalId: `snomed:${result.code}`,
            name: result.display,
            codeSystem: 'snomed' as const,
            source: 'snomed' as const,
          },
        ];
      });
    } catch (error: unknown) {
      this.logUnavailable('SNOMED', error);
      return [];
    }
  }

  private removeDuplicates(terms: MedicalTerm[]): MedicalTerm[] {
    const knownNames = new Set<string>();

    return terms.filter((term) => {
      const normalizedName = term.name.trim().toLocaleLowerCase();

      if (!normalizedName || knownNames.has(normalizedName)) {
        return false;
      }

      knownNames.add(normalizedName);
      return true;
    });
  }

  private mapDatabaseTerm(term: {
    localId: number;
    externalId: string | null;
    name: string;
  }): MedicalTerm {
    const prefix = term.externalId?.split(':', 1)[0];
    const codeSystem: CodeSystem = this.isCodeSystem(prefix) ? prefix : 'local';

    return {
      id: term.externalId ?? `local:${term.localId}`,
      ...(term.externalId ? { externalId: term.externalId } : {}),
      name: term.name,
      codeSystem,
      source: 'existing_db',
    };
  }

  private mergeResults(
    databaseResults: MedicalTerm[],
    externalGroups: MedicalTerm[][],
  ): MedicalTerm[] {
    const externalResults: MedicalTerm[] = [];
    const maxGroupLength = Math.max(
      0,
      ...externalGroups.map((group) => group.length),
    );

    for (let index = 0; index < maxGroupLength; index++) {
      for (const group of externalGroups) {
        const result = group[index];
        if (result) externalResults.push(result);
      }
    }

    return this.removeDuplicates([
      ...databaseResults.slice(0, 10),
      ...externalResults,
    ]).slice(0, 20);
  }

  private isCodeSystem(value: string | undefined): value is CodeSystem {
    return ['snomed', 'rxnorm', 'umls', 'icd10cm'].includes(value ?? '');
  }

  private logUnavailable(provider: string, error: unknown) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    this.logger.warn(`${provider} search unavailable: ${reason}`);
  }
}
