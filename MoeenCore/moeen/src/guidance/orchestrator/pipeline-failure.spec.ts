import { runStage, toPipelineFailure, PipelineFailure } from './pipeline-failure';

describe('runStage', () => {
  it('returns the value on success', async () => {
    const result = await runStage('scope', () => 42);
    expect(result).toBe(42);
  });

  it('converts a synchronous throw into a PipelineFailure with the right stage', async () => {
    await expect(
      runStage('retrieve', () => {
        throw new Error('boom');
      }),
    ).rejects.toMatchObject<Partial<PipelineFailure>>({
      stage: 'retrieve',
      message: 'boom',
    });
  });

  it('converts a rejected promise into a PipelineFailure the same way', async () => {
    await expect(
      runStage('call', () => Promise.reject(new Error('provider down'))),
    ).rejects.toMatchObject<Partial<PipelineFailure>>({
      stage: 'call',
      message: 'provider down',
    });
  });
});

describe('toPipelineFailure', () => {
  it('falls back to a generic message for a non-Error throw', () => {
    const failure = toPipelineFailure('validate', 'not an error object');
    expect(failure.message).toBe('Unknown pipeline stage failure');
    expect(failure.cause).toBe('not an error object');
  });
});
