import { Test } from '@nestjs/testing';

import { DRUG_ALLERGY_CHECKER } from '../medication-safety.contracts';
import { DrugAllergyCheckerService } from './drug-allergy-checker.service';
import { DrugAllergyContextProviderService } from './drug-allergy-context.provider';
import { DRUG_ALLERGY_CONTEXT_PROVIDER } from './drug-allergy.tokens';

describe('DrugAllergyModule provider registration', () => {
  it('maps the checker and context tokens to their services', async () => {
    const checker = {};
    const contextProvider = {};

    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: DrugAllergyCheckerService,
          useValue: checker,
        },
        {
          provide: DrugAllergyContextProviderService,
          useValue: contextProvider,
        },
        {
          provide: DRUG_ALLERGY_CHECKER,
          useExisting: DrugAllergyCheckerService,
        },
        {
          provide: DRUG_ALLERGY_CONTEXT_PROVIDER,
          useExisting: DrugAllergyContextProviderService,
        },
      ],
    }).compile();

    expect(moduleRef.get(DRUG_ALLERGY_CHECKER)).toBe(checker);
    expect(moduleRef.get(DRUG_ALLERGY_CONTEXT_PROVIDER)).toBe(contextProvider);
  });
});
