import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { RxNormUnavailableError } from './rxnorm-unavailable.error';

type RxNormRxcuiResponse = {
  idGroup?: {
    rxnormId?: string[];
  };
};

type RxNormRelatedResponse = {
  relatedGroup?: {
    conceptGroup?: Array<{
      tty?: string;
      conceptProperties?: Array<{
        rxcui?: string;
        name?: string;
        tty?: string;
      }>;
    }>;
  };
};

type RxNormPropertiesResponse = {
  properties?: {
    rxcui?: string;
    name?: string;
    tty?: string;
  };
};

export type RxNormConcept = {
  rxcui: string;
  name: string;
  tty: string | null;
};

export type RxNormResolution =
  | {
      status: 'resolved';
      inputName: string;
      rxcui: string;
    }
  | {
      status: 'ambiguous';
      inputName: string;
      rxcuis: string[];
    }
  | {
      status: 'not_found';
      inputName: string | null;
    };

// This host's latency to us is intermittent (observed anywhere from
// <1s to ~5s), so 5000ms trips more often than it should. 8000ms matches
// the margin used for the other external medical lookups (openFDA,
// Clinical Tables).
const DEFAULT_RXNORM_TIMEOUT_MS = 8000;

@Injectable()
export class RxNormService {
  private readonly logger = new Logger(RxNormService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async resolveMedication(
    genericName?: string | null,
    brandName?: string | null,
  ): Promise<RxNormResolution> {
    const searchNames = this.getSearchNames(genericName, brandName);

    if (searchNames.length === 0) {
      return {
        status: 'not_found',
        inputName: null,
      };
    }

    let ambiguousResult: RxNormResolution | null = null;

    for (const name of searchNames) {
      const rxcuis = await this.findRxCuisByName(name);

      if (rxcuis.length === 1) {
        return {
          status: 'resolved',
          inputName: name,
          rxcui: rxcuis[0],
        };
      }

      if (rxcuis.length > 1 && ambiguousResult === null) {
        ambiguousResult = {
          status: 'ambiguous',
          inputName: name,
          rxcuis,
        };
      }
    }

    if (ambiguousResult !== null) {
      return ambiguousResult;
    }

    return {
      status: 'not_found',
      inputName: searchNames[0],
    };
  }

  async findRxCuisByName(name: string): Promise<string[]> {
    const normalizedName = name.trim();

    if (!normalizedName) {
      return [];
    }

    const baseUrl =
      this.configService.get<string>('RXNORM_BASE_URL') ??
      'https://rxnav.nlm.nih.gov';

    const configuredTimeout = Number(
      this.configService.get<string>('RXNORM_TIMEOUT_MS') ??
        DEFAULT_RXNORM_TIMEOUT_MS,
    );
    const timeout =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_RXNORM_TIMEOUT_MS;

    try {
      const response = await firstValueFrom(
        this.httpService.get<RxNormRxcuiResponse>(
          `${baseUrl}/REST/rxcui.json`,
          {
            params: {
              name: normalizedName,
              search: 2,
              allsrc: 0,
            },
            timeout,
            // Some networks can't reach this host over IPv6 (ENETUNREACH),
            // which otherwise eats into the timeout budget before falling
            // back to IPv4.
            family: 4,
          },
        ),
      );

      return [...new Set(response.data.idGroup?.rxnormId ?? [])];
    } catch (error: unknown) {
      this.logRequestFailure('findRxCuisByName', error);
      throw new RxNormUnavailableError(normalizedName);
    }
  }

  private logRequestFailure(operation: string, error: unknown): void {
    const details = isAxiosError(error)
      ? `axios: code=${error.code ?? 'unknown'} status=${error.response?.status ?? 'none'}`
      : error instanceof Error
        ? error.name
        : 'UnknownError';
    this.logger.error(`RxNorm ${operation} failed: ${details}`);
  }

  async getConceptByRxcui(rxcui: string): Promise<RxNormConcept | null> {
    const normalizedRxcui = rxcui.trim();

    if (!/^\d+$/.test(normalizedRxcui)) {
      return null;
    }

    const baseUrl =
      this.configService.get<string>('RXNORM_BASE_URL') ??
      'https://rxnav.nlm.nih.gov';

    const configuredTimeout = Number(
      this.configService.get<string>('RXNORM_TIMEOUT_MS') ??
        DEFAULT_RXNORM_TIMEOUT_MS,
    );

    const timeout =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_RXNORM_TIMEOUT_MS;

    try {
      const response = await firstValueFrom(
        this.httpService.get<RxNormPropertiesResponse>(
          `${baseUrl}/REST/rxcui/${encodeURIComponent(normalizedRxcui)}/properties.json`,
          {
            timeout,
            family: 4,
          },
        ),
      );

      const properties = response.data.properties;

      if (
        !properties?.rxcui ||
        !properties.name?.trim() ||
        properties.rxcui !== normalizedRxcui
      ) {
        return null;
      }

      return {
        rxcui: properties.rxcui,
        name: properties.name.trim(),
        tty: properties.tty?.trim() || null,
      };
    } catch (error: unknown) {
      this.logRequestFailure('getConceptByRxcui', error);
      throw new RxNormUnavailableError(normalizedRxcui);
    }
  }

  async getIngredientNames(rxcui: string): Promise<string[]> {
    const normalizedRxcui = rxcui.trim();

    if (!normalizedRxcui) {
      return [];
    }

    const baseUrl =
      this.configService.get<string>('RXNORM_BASE_URL') ??
      'https://rxnav.nlm.nih.gov';

    const configuredTimeout = Number(
      this.configService.get<string>('RXNORM_TIMEOUT_MS') ??
        DEFAULT_RXNORM_TIMEOUT_MS,
    );

    const timeout =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_RXNORM_TIMEOUT_MS;

    try {
      const response = await firstValueFrom(
        this.httpService.get<RxNormRelatedResponse>(
          `${baseUrl}/REST/rxcui/${encodeURIComponent(normalizedRxcui)}/related.json`,
          {
            params: {
              tty: 'IN',
            },
            timeout,
            family: 4,
          },
        ),
      );

      const names =
        response.data.relatedGroup?.conceptGroup
          ?.filter((group) => group.tty === 'IN')
          .flatMap((group) => group.conceptProperties ?? [])
          .map((concept) => concept.name?.trim())
          .filter((name): name is string => Boolean(name)) ?? [];

      return [...new Set(names)];
    } catch (error: unknown) {
      this.logRequestFailure('getIngredientNames', error);
      throw new RxNormUnavailableError(normalizedRxcui);
    }
  }

  private getSearchNames(
    genericName?: string | null,
    brandName?: string | null,
  ): string[] {
    const names = [genericName, brandName]
      .map((name) => name?.trim())
      .filter((name): name is string => Boolean(name));

    const seen = new Set<string>();

    return names.filter((name) => {
      const key = name.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }
}
