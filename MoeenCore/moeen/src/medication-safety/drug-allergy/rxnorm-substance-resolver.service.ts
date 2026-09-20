import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

type RxNormIdResponse = {
  idGroup?: {
    rxnormId?: string[];
  };
};

type RxNormPropertyResponse = {
  propConceptGroup?: {
    propConcept?: Array<{
      propName?: string;
      propValue?: string;
    }>;
  };
};

@Injectable()
export class RxNormSubstanceResolverService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getUniiIdentifiersForSnomed(snomedId: string): Promise<string[]> {
    const rxcuis = await this.getRxcuisForSnomed(snomedId);

    const identifiers = await this.getUniiIdentifiersForRxcuis(rxcuis);

    if (!identifiers.length) {
      throw new UnprocessableEntityException(
        `No UNII mapping was found for SNOMED substance ${snomedId}`,
      );
    }

    return identifiers;
  }

  async getUniiIdentifiersForRxcui(rxcui: string): Promise<string[]> {
    const identifiers = await this.getUniiIdentifiersForRxcuis([rxcui]);

    if (!identifiers.length) {
      throw new UnprocessableEntityException(
        `No UNII mapping was found for RxNorm substance ${rxcui}`,
      );
    }

    return identifiers;
  }

  private async getUniiIdentifiersForRxcuis(
    rxcuis: string[],
  ): Promise<string[]> {
    const uniiGroups = await Promise.all(
      rxcuis.map((rxcui) => this.getUniisForRxcui(rxcui)),
    );

    return Array.from(
      new Set(uniiGroups.flat().map((unii) => `unii:${unii.toUpperCase()}`)),
    );
  }

  private getBaseUrl(): string {
    return (
      this.configService.get<string>('RXNORM_BASE_URL') ??
      'https://rxnav.nlm.nih.gov'
    );
  }

  private async getRxcuisForSnomed(snomedId: string): Promise<string[]> {
    let data: RxNormIdResponse;

    try {
      const response = await firstValueFrom(
        this.httpService.get<RxNormIdResponse>(
          `${this.getBaseUrl()}/REST/rxcui.json`,
          {
            params: {
              idtype: 'SNOMEDCT',
              id: snomedId,
              allsrc: 0,
            },
          },
        ),
      );

      data = response.data;
    } catch {
      throw new ServiceUnavailableException(
        'RxNorm substance mapping service is unavailable',
      );
    }

    const rxcuis = data.idGroup?.rxnormId ?? [];

    if (!rxcuis.length) {
      throw new UnprocessableEntityException(
        `No RxNorm mapping was found for SNOMED substance ${snomedId}`,
      );
    }

    return Array.from(new Set(rxcuis));
  }

  private async getUniisForRxcui(rxcui: string): Promise<string[]> {
    let data: RxNormPropertyResponse;

    try {
      const response = await firstValueFrom(
        this.httpService.get<RxNormPropertyResponse>(
          `${this.getBaseUrl()}/REST/rxcui/${encodeURIComponent(rxcui)}/property.json`,
          {
            params: {
              propName: 'UNII_CODE',
            },
          },
        ),
      );

      data = response.data;
    } catch {
      throw new ServiceUnavailableException(
        'RxNorm substance property service is unavailable',
      );
    }

    return (data.propConceptGroup?.propConcept ?? [])
      .filter(
        (property) =>
          property.propName === 'UNII_CODE' &&
          typeof property.propValue === 'string' &&
          property.propValue.trim().length > 0,
      )
      .map((property) => property.propValue!.trim());
  }
}
