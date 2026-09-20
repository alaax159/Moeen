import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

const CAUSATIVE_AGENT_SNOMED_ID = '246075003';

type FhirParameterPart = {
  name?: string;
  valueCode?: string;
  valueString?: string;
};

type FhirParameter = {
  name?: string;
  valueCode?: string;
  valueString?: string;
  part?: FhirParameterPart[];
};

type FhirLookupResponse = {
  resourceType?: string;
  parameter?: FhirParameter[];
};

export type SnomedCausativeAgent = {
  snomedId: string;
  name: string | null;
};

@Injectable()
export class SnomedAllergyResolverService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getCausativeAgents(
    allergySnomedId: string,
  ): Promise<SnomedCausativeAgent[]> {
    const configuredBaseUrl = this.configService.getOrThrow<string>(
      'SNOMED_FHIR_BASE_URL',
    );

    const baseUrl = configuredBaseUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/CodeSystem/$lookup`;

    let data: FhirLookupResponse;

    try {
      const response = await firstValueFrom(
        this.httpService.get<FhirLookupResponse>(url, {
          params: {
            system: 'http://snomed.info/sct',
            code: allergySnomedId,
            property: 'normalForm',
            _format: 'json',
          },
        }),
      );

      data = response.data;
    } catch {
      throw new ServiceUnavailableException(
        'SNOMED terminology service is unavailable',
      );
    }

    const normalForm = this.extractNormalForm(data);
    const agents = this.extractCausativeAgents(normalForm);

    if (!agents.length) {
      throw new UnprocessableEntityException(
        `SNOMED allergy ${allergySnomedId} has no resolvable causative agent`,
      );
    }

    return agents;
  }

  private extractNormalForm(response: FhirLookupResponse): string | null {
    for (const parameter of response.parameter ?? []) {
      if (parameter.name !== 'property') {
        continue;
      }

      const code = parameter.part?.find(
        (part) => part.name === 'code',
      )?.valueCode;

      if (code !== 'normalForm') {
        continue;
      }

      return (
        parameter.part?.find((part) => part.name === 'value')?.valueString ??
        null
      );
    }

    return null;
  }

  private extractCausativeAgents(
    normalForm: string | null,
  ): SnomedCausativeAgent[] {
    if (!normalForm) {
      return [];
    }

    const agents = new Map<string, SnomedCausativeAgent>();

    const pattern = new RegExp(
      `${CAUSATIVE_AGENT_SNOMED_ID}\\|[^|]*\\|\\s*=\\s*\\(?\\s*(\\d+)\\|([^|]+)\\|`,
      'g',
    );

    for (const match of normalForm.matchAll(pattern)) {
      const snomedId = match[1];
      const name = match[2]?.trim() || null;

      if (!snomedId) {
        continue;
      }

      agents.set(snomedId, {
        snomedId,
        name,
      });
    }

    return Array.from(agents.values());
  }
}
