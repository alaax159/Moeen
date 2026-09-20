import { GetExplanationController } from './get-explanation.controller';

describe('GetExplanationController', () => {
  const findingId = '33333333-3333-4333-8333-333333333333';

  it('parses the id param and passes it with the authenticated user id to the service', async () => {
    const service = {
      getExplanation: jest.fn().mockResolvedValue({
        text: 'x',
        citations: [],
        severity: 'major',
        validationStatus: 'accepted',
        cached: false,
      }),
    };
    const controller = new GetExplanationController(service as never);

    await controller.getExplanation(findingId, { id: 42 });

    expect(service.getExplanation).toHaveBeenCalledWith(findingId, 42);
  });
});
