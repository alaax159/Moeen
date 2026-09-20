import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../../../database/schema';
import { GetChatCitationService } from './get-chat-citation.service';

type MockRow = {
  id: number;
  setId: string;
  section: string;
  text: string;
};

function createDb(rows: MockRow[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });

  const db = {
    select,
  } as unknown as NodePgDatabase<typeof schema>;

  return {
    db,
    select,
    from,
    where,
    limit,
  };
}

describe('GetChatCitationService', () => {
  it('rejects an invalid citation id before querying the database', async () => {
    const mock = createDb([]);
    const service = new GetChatCitationService(mock.db);

    await expect(service.getCitation('not-a-citation')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(mock.select).not.toHaveBeenCalled();
  });

  it.each([
    'label-chunk-0',
    'label-chunk-2147483648',
    `label-chunk-${'9'.repeat(100)}`,
  ])(
    'rejects out-of-range citation id %s before querying the database',
    async (citationId) => {
      const mock = createDb([]);
      const service = new GetChatCitationService(mock.db);

      await expect(service.getCitation(citationId)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(mock.select).not.toHaveBeenCalled();
    },
  );

  it('returns not found when the label chunk does not exist', async () => {
    const mock = createDb([]);
    const service = new GetChatCitationService(mock.db);

    await expect(service.getCitation('label-chunk-999')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the exact cited label chunk with section metadata', async () => {
    const mock = createDb([
      {
        id: 42,
        setId: 'setid-lisinopril-001',
        section: 'warnings',
        text: 'Monitor renal function.',
      },
    ]);

    const service = new GetChatCitationService(mock.db);

    await expect(service.getCitation('label-chunk-42')).resolves.toEqual({
      citationId: 'label-chunk-42',
      setId: 'setid-lisinopril-001',
      section: 'warnings',
      text: 'Monitor renal function.',
      labelUrl:
        'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=setid-lisinopril-001',
    });
  });
});
