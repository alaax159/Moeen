import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { firstValueFrom } from 'rxjs';

import type { MedicationAllergen } from './drug-allergy.types';

const DAILYMED_BASE_URL = 'https://dailymed.nlm.nih.gov/dailymed/services/v2';

const UNII_CODE_SYSTEM = '2.16.840.1.113883.4.9';

@Injectable()
export class DailyMedIngredientService {
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
  });

  constructor(private readonly httpService: HttpService) {}

  async getMedicationAllergens(
    dailyMedId: string,
  ): Promise<MedicationAllergen[]> {
    const setId = this.normalizeSetId(dailyMedId);

    if (!setId) {
      throw new BadRequestException('DailyMed Set ID is required');
    }

    let xml: string;

    try {
      const response = await firstValueFrom(
        this.httpService.get<string>(
          `${DAILYMED_BASE_URL}/spls/${encodeURIComponent(setId)}.xml`,
          {
            responseType: 'text',
          },
        ),
      );

      xml = response.data.replace(/^\uFEFF/, '').trim();
    } catch {
      throw new ServiceUnavailableException(
        'DailyMed ingredient data is unavailable',
      );
    }

    if (XMLValidator.validate(xml) !== true) {
      throw new BadGatewayException('DailyMed returned invalid SPL XML');
    }

    const parsed = this.parser.parse(xml);

    return this.extractMedicationAllergens(parsed);
  }

  private normalizeSetId(dailyMedId: string): string {
    return dailyMedId.trim().replace(/^dm\//i, '');
  }

  private extractMedicationAllergens(root: unknown): MedicationAllergen[] {
    const ingredients = new Map<string, MedicationAllergen>();

    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) {
          visit(item);
        }

        return;
      }

      if (!this.isRecord(value)) {
        return;
      }

      if ('ingredient' in value) {
        const ingredientNodes = Array.isArray(value.ingredient)
          ? value.ingredient
          : [value.ingredient];

        for (const ingredient of ingredientNodes) {
          this.collectIngredient(ingredient, ingredients);
        }
      }

      for (const [key, child] of Object.entries(value)) {
        if (key !== 'ingredient') {
          visit(child);
        }
      }
    };

    visit(root);

    return Array.from(ingredients.values());
  }

  private collectIngredient(
    value: unknown,
    ingredients: Map<string, MedicationAllergen>,
  ): void {
    if (!this.isRecord(value)) {
      return;
    }

    const classCode = value['@_classCode'];

    if (
      classCode !== 'ACTIB' &&
      classCode !== 'ACTIM' &&
      classCode !== 'IACT'
    ) {
      return;
    }

    const substance = value.ingredientSubstance;

    if (!this.isRecord(substance)) {
      return;
    }

    const codeNode = substance.code;

    if (!this.isRecord(codeNode)) {
      return;
    }

    if (codeNode['@_codeSystem'] !== UNII_CODE_SYSTEM) {
      return;
    }

    const rawCode = codeNode['@_code'];

    if (typeof rawCode !== 'string' || !rawCode.trim()) {
      return;
    }

    const name = this.readText(substance.name);

    if (!name) {
      return;
    }

    const identifier = `unii:${rawCode.trim().toUpperCase()}`;

    if (ingredients.has(identifier)) {
      return;
    }

    ingredients.set(identifier, {
      identifier,
      name,
      source: classCode === 'IACT' ? 'excipient' : 'drug_ingredient',
    });
  }

  private readText(value: unknown): string | null {
    if (typeof value === 'string') {
      const text = value.trim();
      return text || null;
    }

    if (this.isRecord(value) && typeof value['#text'] === 'string') {
      const text = value['#text'].trim();
      return text || null;
    }

    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
