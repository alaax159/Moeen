import { Test } from '@nestjs/testing';
import { ResponseValidatorModule } from './response-validator.module';
import { ResponseValidator } from './response-validator.service';
import { CLEAN_ANSWER, envelope } from './response-validator.fixtures';

describe('ResponseValidatorModule', () => {
  it('resolves the validator through Nest without requiring a rules-array provider', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ResponseValidatorModule],
    }).compile();

    const validator = moduleRef.get(ResponseValidator);

    expect(
      validator.validate({
        rawText: envelope(CLEAN_ANSWER),
        suppliedCitationIds: ['chunk-a1'],
      }).accepted,
    ).toBe(true);
  });
});
