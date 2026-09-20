import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';

import { DailyMedIngredientService } from './dailymed-ingredient.service';

describe('DailyMedIngredientService', () => {
  let httpService: {
    get: jest.Mock;
  };

  let service: DailyMedIngredientService;

  beforeEach(() => {
    httpService = {
      get: jest.fn(),
    };

    service = new DailyMedIngredientService(
      httpService as unknown as HttpService,
    );
  });

  const xml = `
    <?xml version="1.0" encoding="UTF-8"?>
    <document xmlns="urn:hl7-org:v3">
      <component>
        <manufacturedProduct>

          <ingredient classCode="ACTIB">
            <ingredientSubstance>
              <code
                code="R16CO5Y76E"
                codeSystem="2.16.840.1.113883.4.9"
              />
              <name>ASPIRIN</name>
            </ingredientSubstance>
          </ingredient>

          <ingredient classCode="IACT">
            <ingredientSubstance>
              <code
                code="2G86QN327L"
                codeSystem="2.16.840.1.113883.4.9"
              />
              <name>GELATIN, UNSPECIFIED</name>
            </ingredientSubstance>
          </ingredient>

          <ingredient classCode="IACT">
            <ingredientSubstance>
              <code
                code="O8232NY3SJ"
                codeSystem="2.16.840.1.113883.4.9"
              />
              <name>STARCH, CORN</name>
            </ingredientSubstance>
          </ingredient>

        </manufacturedProduct>
      </component>
    </document>
  `;

  it('loads active and inactive ingredients from a DailyMed SPL', async () => {
    httpService.get.mockReturnValue(
      of({
        data: xml,
      }),
    );

    const result = await service.getMedicationAllergens('dm/example-set-id');

    expect(httpService.get).toHaveBeenCalledWith(
      'https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/example-set-id.xml',
      {
        responseType: 'text',
      },
    );

    expect(result).toEqual([
      {
        identifier: 'unii:R16CO5Y76E',
        name: 'ASPIRIN',
        source: 'drug_ingredient',
      },
      {
        identifier: 'unii:2G86QN327L',
        name: 'GELATIN, UNSPECIFIED',
        source: 'excipient',
      },
      {
        identifier: 'unii:O8232NY3SJ',
        name: 'STARCH, CORN',
        source: 'excipient',
      },
    ]);
  });

  it('returns active ingredients as drug ingredients', async () => {
    httpService.get.mockReturnValue(
      of({
        data: xml,
      }),
    );

    const result = await service.getMedicationAllergens('example-set-id');

    expect(result).toContainEqual({
      identifier: 'unii:R16CO5Y76E',
      name: 'ASPIRIN',
      source: 'drug_ingredient',
    });
  });

  it('returns ACTIM active ingredients as drug ingredients', async () => {
    const actimXml = `
      <document>
        <manufacturedProduct>
          <ingredient classCode="ACTIM">
            <ingredientSubstance>
              <code
                code="804826J2HU"
                codeSystem="2.16.840.1.113883.4.9"
              />
              <name>AMOXICILLIN</name>
            </ingredientSubstance>
          </ingredient>
        </manufacturedProduct>
      </document>
    `;

    httpService.get.mockReturnValue(
      of({
        data: actimXml,
      }),
    );

    const result = await service.getMedicationAllergens('example-set-id');

    expect(result).toContainEqual({
      identifier: 'unii:804826J2HU',
      name: 'AMOXICILLIN',
      source: 'drug_ingredient',
    });
  });
  it('returns inactive ingredients as excipients', async () => {
    httpService.get.mockReturnValue(
      of({
        data: xml,
      }),
    );

    const result = await service.getMedicationAllergens('example-set-id');

    expect(result).toContainEqual({
      identifier: 'unii:2G86QN327L',
      name: 'GELATIN, UNSPECIFIED',
      source: 'excipient',
    });
  });

  it('removes duplicate medication allergens', async () => {
    const duplicateXml = `
      <document>
        <manufacturedProduct>
          <ingredient classCode="IACT">
            <ingredientSubstance>
              <code
                code="2G86QN327L"
                codeSystem="2.16.840.1.113883.4.9"
              />
              <name>GELATIN, UNSPECIFIED</name>
            </ingredientSubstance>
          </ingredient>

          <ingredient classCode="IACT">
            <ingredientSubstance>
              <code
                code="2G86QN327L"
                codeSystem="2.16.840.1.113883.4.9"
              />
              <name>GELATIN, UNSPECIFIED</name>
            </ingredientSubstance>
          </ingredient>
        </manufacturedProduct>
      </document>
    `;

    httpService.get.mockReturnValue(
      of({
        data: duplicateXml,
      }),
    );

    const result = await service.getMedicationAllergens('example-set-id');

    expect(result).toHaveLength(1);

    expect(result[0]).toEqual({
      identifier: 'unii:2G86QN327L',
      name: 'GELATIN, UNSPECIFIED',
      source: 'excipient',
    });
  });

  it('throws when DailyMed is unavailable', async () => {
    httpService.get.mockReturnValue(
      throwError(() => new Error('network error')),
    );

    await expect(
      service.getMedicationAllergens('example-set-id'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws when DailyMed returns invalid XML', async () => {
    httpService.get.mockReturnValue(
      of({
        data: '<document><ingredient>',
      }),
    );

    await expect(
      service.getMedicationAllergens('example-set-id'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
