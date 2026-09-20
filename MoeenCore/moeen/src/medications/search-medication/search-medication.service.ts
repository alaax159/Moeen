import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import { stripDailyMedPrefix } from '../../database/daily-med-id.util';
import { DatabaseRepository } from '../../database/repository/database.repository';

type DailyMedItem = {
  name_type: 'B' | 'G';
  drug_name: string;
};

type MedicationSearchResult = {
  source: 'existing_db' | 'palestine_moh' | 'dailymed';
  medication: {
    id?: number;
    brandName?: string;
    genericName?: string;
    dailyMedId?: string;
    description?: string;
    medicationCatalogId?: number;
    manufacturer?: string;
    dosageForm?: string;
    isEssential?: boolean;
  };
  verified: 'verified' | 'non-verified';
  verificationSource: 'palestine_moh' | 'dailymed' | 'rxnorm' | 'manual';
  verificationStatus: 'verified' | 'unresolved';
  relevance?: number;
};

type DailyMedSpl = {
  setid: string;
  title: string;
};

type DailyMedNamesResponse = {
  data?: DailyMedItem[];
  metadata?: { total_pages?: number };
};

const DAILYMED_NAMES_URL =
  'https://dailymed.nlm.nih.gov/dailymed/services/v2/drugnames.json';

// DailyMed caps a page at 100 rows and orders a substring search
// alphabetically, so a prefix the patient is still typing ("pan") is buried:
// page 1 of "pan" is all CALCIUM PANTOTHENATE and 9 SPLEEN PANCREAS, and
// PANADOL sits pages later. Enough pages are pulled to reach it, bounded so a
// very common fragment cannot fan out indefinitely.
const DAILYMED_PAGE_SIZE = 100;
const MAX_DAILYMED_PAGES = 8;

// Local rows arrive from a substring LIKE, so a name that merely contains the
// query inside a word scores below this and is dropped.
const LOCAL_RELEVANCE_THRESHOLD = 50;

const MAX_LOCAL_RESULTS = 10;

@Injectable()
export class MedicationsService {
  constructor(
    private readonly databaseRepository: DatabaseRepository,
    private readonly httpService: HttpService,
  ) {}

  async search(query: string) {
    const searchTerm = query.trim();

    const [databaseResults, catalogResults, dailyMedNames] = await Promise.all([
      this.databaseRepository.searchMedications(searchTerm),
      this.databaseRepository.searchMedicationCatalog(searchTerm),
      this.fetchDailyMedNames(searchTerm),
    ]);
    const dailyMedResults: Array<DailyMedItem & { relevance: number }> =
      dailyMedNames
      .map((item) => ({
        ...item,
        relevance: this.nameRelevance(item.drug_name, searchTerm),
      }))
      .filter((item) => item.relevance >= 50)
      .sort((left, right) => right.relevance - left.relevance)
      .slice(0, 20);
    const dailyMedDetails = await Promise.all(
      dailyMedResults.map(async (item) => {
        const response = await firstValueFrom(
          this.httpService.get<{ data: DailyMedSpl[] }>(
            'https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json',
            {
              params: {
                drug_name: item.drug_name,
                name_type: item.name_type.toLowerCase(),
                pagesize: 1,
              },
            },
          ),
        ).catch(() => null);

        return response?.data.data?.[0];
      }),
    );

    const results: MedicationSearchResult[] = [
      ...this.rankLocalResults(databaseResults, searchTerm, (medication) => ({
        source: 'existing_db' as const,
        medication: {
          id: medication.id,
          ...(medication.brandName ? { brandName: medication.brandName } : {}),
          ...(medication.genericName
            ? { genericName: medication.genericName }
            : {}),
          ...(medication.dailyMedId
            ? { dailyMedId: medication.dailyMedId }
            : {}),
          ...(medication.description
            ? { description: medication.description }
            : {}),
        },
        // The row's own columns decide this. Medications a patient typed in
        // by hand land in this table too, and must never come back to other
        // patients wearing a "Verified" badge.
        verified:
          medication.verificationStatus === 'verified'
            ? ('verified' as const)
            : ('non-verified' as const),
        verificationSource:
          medication.verificationSource ?? ('manual' as const),
        verificationStatus: medication.verificationStatus ?? 'unresolved',
      })),
      ...this.rankLocalResults(catalogResults, searchTerm, (entry) => ({
        source: 'palestine_moh' as const,
        medication: {
          medicationCatalogId: entry.id,
          brandName: entry.name,
          ...(entry.manufacturer ? { manufacturer: entry.manufacturer } : {}),
          ...(entry.dosageForm ? { dosageForm: entry.dosageForm } : {}),
          isEssential: entry.isEssential,
        },
        verified: 'verified' as const,
        verificationSource: 'palestine_moh' as const,
        verificationStatus: 'verified' as const,
      })),
      ...dailyMedResults
        .flatMap((item, index) => {
          const details = dailyMedDetails[index];

          if (!details?.setid) return [];

          return [
            {
              source: 'dailymed' as const,
              medication: {
                ...(item.name_type === 'B'
                  ? { brandName: item.drug_name }
                  : { genericName: item.drug_name }),
                dailyMedId: details.setid,
                ...(details.title ? { description: details.title } : {}),
              },
              verified: 'non-verified' as const,
              verificationSource: 'dailymed' as const,
              verificationStatus: 'verified' as const,
              relevance: item.relevance,
            },
          ];
        })
        .sort((left, right) => right.relevance - left.relevance)
        .slice(0, 10),
    ];

    return this.removeDuplicates(results).map(
      ({ relevance: _, ...result }) => result,
    );
  }

  private async fetchDailyMedNames(searchTerm: string): Promise<DailyMedItem[]> {
    const firstPage = await this.fetchDailyMedNamePage(searchTerm, 1);

    if (!firstPage) {
      return [];
    }

    const totalPages = Math.min(
      firstPage.metadata?.total_pages ?? 1,
      MAX_DAILYMED_PAGES,
    );

    // Page count is only known after the first response, so the remainder go
    // out together rather than one round trip at a time.
    const remainingPages = await Promise.all(
      Array.from({ length: Math.max(totalPages - 1, 0) }, (_, index) =>
        this.fetchDailyMedNamePage(searchTerm, index + 2),
      ),
    );

    return [firstPage, ...remainingPages].flatMap((page) => page?.data ?? []);
  }

  private fetchDailyMedNamePage(
    searchTerm: string,
    page: number,
  ): Promise<DailyMedNamesResponse | null> {
    return firstValueFrom(
      this.httpService.get<DailyMedNamesResponse>(DAILYMED_NAMES_URL, {
        params: {
          drug_name: searchTerm,
          name_type: 'both',
          pagesize: DAILYMED_PAGE_SIZE,
          ...(page > 1 ? { page } : {}),
        },
      }),
    )
      .then((response) => response.data)
      .catch(() => null);
  }

  // Database and catalog rows are matched in SQL by substring and come back
  // unordered (or merely alphabetical), so they are ranked here before being
  // merged with the already-ranked DailyMed candidates.
  private rankLocalResults<TRow>(
    rows: TRow[],
    searchTerm: string,
    toResult: (row: TRow) => MedicationSearchResult,
  ): MedicationSearchResult[] {
    return rows
      .map((row) => {
        const result = toResult(row);

        return {
          ...result,
          relevance: this.localNameRelevance(
            [result.medication.brandName, result.medication.genericName],
            searchTerm,
          ),
        };
      })
      .filter((result) => result.relevance >= LOCAL_RELEVANCE_THRESHOLD)
      .sort((left, right) => right.relevance - left.relevance)
      .slice(0, MAX_LOCAL_RESULTS);
  }

  private localNameRelevance(
    names: Array<string | undefined>,
    query: string,
  ): number {
    return names.reduce<number>(
      (best, name) =>
        Math.max(best, name ? this.partialNameRelevance(name, query) : 0),
      0,
    );
  }

  // Unlike a DailyMed candidate, a local query is usually a short prefix the
  // patient is still typing ("pan"), so prefix hits have to outrank names
  // that only happen to contain those letters mid-word ("ATROSPAN").
  private partialNameRelevance(name: string, query: string): number {
    const normalizedName = this.normalizeForSearch(name);
    const normalizedQuery = this.normalizeForSearch(query);

    if (!normalizedName || !normalizedQuery) return 0;
    if (normalizedName === normalizedQuery) return 100;
    if (normalizedName.startsWith(`${normalizedQuery} `)) return 95;
    if (normalizedName.startsWith(normalizedQuery)) return 90;

    const nameTokens = normalizedName.split(' ');
    const queryTokens = normalizedQuery.split(' ');

    if (nameTokens.some((token) => token.startsWith(normalizedQuery))) {
      return 70;
    }

    if (
      queryTokens.every((queryToken) =>
        nameTokens.some((token) => token.startsWith(queryToken)),
      )
    ) {
      return 60;
    }

    return normalizedName.includes(normalizedQuery) ? 30 : 0;
  }

  private nameRelevance(name: string, query: string): number {
    const normalizedName = this.normalizeForSearch(name);
    const normalizedQuery = this.normalizeForSearch(query);

    if (!normalizedName || !normalizedQuery) return 0;
    if (normalizedName === normalizedQuery) return 100;
    if (normalizedName.startsWith(`${normalizedQuery} `)) return 90;
    // A name the query opens mid-word ("pan" -> "PANADOL"). Ranked below a
    // whole-word hit but above the token scores computed further down, and
    // weighted by how much of the name the query already covers so that
    // PANADOL beats PANACEA LIFE SCIENCES HAND SANITIZER SPRITZ.
    if (normalizedName.startsWith(normalizedQuery)) {
      const coverage = normalizedQuery.length / normalizedName.length;
      return Math.round(81 + coverage * 8);
    }

    const queryTokens = normalizedQuery.split(' ');
    const nameTokens = normalizedName.split(' ');
    // Every token but the last has to match whole, because the patient has
    // finished typing those. Only the token under the cursor may be a prefix.
    const finishedTokens = queryTokens.slice(0, -1);
    const activeToken = queryTokens[queryTokens.length - 1];

    if (!finishedTokens.every((token) => nameTokens.includes(token))) return 0;
    if (!nameTokens.some((token) => token.startsWith(activeToken))) return 0;

    // Long combination products mention many ingredients and match a lot of
    // queries weakly; dividing by the name's own length keeps them out.
    const compactness = queryTokens.length / nameTokens.length;
    return Math.round(40 + compactness * 40);
  }

  private normalizeForSearch(value: string): string {
    return value
      .normalize('NFKC')
      .toLocaleLowerCase('en')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private removeDuplicates(results: MedicationSearchResult[]) {
    const uniqueResults: MedicationSearchResult[] = [];
    const knownIdentities = new Set<string>();
    // Which source first claimed a given name. Two catalog entries can share
    // a name (same drug, different manufacturer) and both belong in the list;
    // the same drug arriving again from a *different* source is the duplicate.
    const nameOwners = new Map<string, MedicationSearchResult['source']>();

    for (const result of results) {
      const identity =
        result.source === 'existing_db'
          ? `medication:${result.medication.id}`
          : result.source === 'palestine_moh'
            ? `palestine_moh:${result.medication.medicationCatalogId}`
            : `dailymed:${result.medication.dailyMedId}`;

      if (knownIdentities.has(identity)) {
        continue;
      }

      // Stored ids carry a `dm/` prefix while DailyMed returns the bare
      // setid, so both are compared on the stripped form.
      const dailyMedIdentity = result.medication.dailyMedId
        ? `setid:${stripDailyMedPrefix(result.medication.dailyMedId)}`
        : null;

      if (dailyMedIdentity && knownIdentities.has(dailyMedIdentity)) {
        continue;
      }

      const name = this.normalizeForSearch(
        result.medication.brandName ?? result.medication.genericName ?? '',
      );

      const nameOwner = name ? nameOwners.get(name) : undefined;

      if (nameOwner && nameOwner !== result.source) {
        continue;
      }

      knownIdentities.add(identity);

      if (dailyMedIdentity) {
        knownIdentities.add(dailyMedIdentity);
      }

      if (name && !nameOwners.has(name)) {
        nameOwners.set(name, result.source);
      }

      uniqueResults.push(result);
    }

    return uniqueResults;
  }
}
