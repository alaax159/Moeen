import { CitationResolver } from './citation-resolver.service';

function mockDb(resolvedRows: unknown[]) {
  const chain: Record<string, jest.Mock> = {};
  for (const method of ['from']) {
    chain[method] = jest.fn().mockReturnValue(chain);
  }
  chain.where = jest.fn().mockResolvedValue(resolvedRows);
  return { select: jest.fn().mockReturnValue(chain) };
}

describe('CitationResolver', () => {
  it('returns [] without querying when given no citation ids', async () => {
    const db = mockDb([]);
    const resolver = new CitationResolver(db as never);

    const result = await resolver.resolve([]);

    expect(result).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('parses the label-chunk-<id> format and returns setId/section per citation', async () => {
    const db = mockDb([
      { id: 42, setId: 'setid-lisinopril-001', section: 'warnings' },
    ]);
    const resolver = new CitationResolver(db as never);

    const result = await resolver.resolve(['label-chunk-42']);

    expect(result).toEqual([
      {
        citationId: 'label-chunk-42',
        setId: 'setid-lisinopril-001',
        section: 'warnings',
      },
    ]);
  });

  it('skips, rather than throws on, a citationId that does not match the expected format', async () => {
    const db = mockDb([]);
    const resolver = new CitationResolver(db as never);

    const result = await resolver.resolve(['not-a-real-citation-id']);

    expect(result).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('skips a citationId whose chunk no longer exists in the database', async () => {
    const db = mockDb([]); // query ran, but the id wasn't found
    const resolver = new CitationResolver(db as never);

    const result = await resolver.resolve(['label-chunk-9999']);

    expect(result).toEqual([]);
  });

  it('resolves multiple citations in one query', async () => {
    const db = mockDb([
      { id: 1, setId: 'setid-a', section: 'warnings' },
      { id: 2, setId: 'setid-a', section: 'drug_interactions' },
    ]);
    const resolver = new CitationResolver(db as never);

    const result = await resolver.resolve(['label-chunk-1', 'label-chunk-2']);

    expect(result).toHaveLength(2);
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});
