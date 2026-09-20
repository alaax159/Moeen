import { processLabelJobId } from './label-ingestion-queue.constants';

describe('processLabelJobId', () => {
  const baseProfile = {
    model: 'deterministic-sha256',
    version: 'v1',
    dimensions: 1536,
  } as const;

  it('is stable for the same document and embedding profile', () => {
    expect(processLabelJobId('set-a', '13', baseProfile)).toBe(
      processLabelJobId('set-a', '13', baseProfile),
    );
  });

  it('changes when the vector space changes so a retained completed job cannot suppress re-embedding', () => {
    const first = processLabelJobId('set-a', '13', baseProfile);
    const upgraded = processLabelJobId('set-a', '13', {
      ...baseProfile,
      version: 'v2',
    });

    expect(upgraded).not.toBe(first);
  });
});
