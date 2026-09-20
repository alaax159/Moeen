import { HttpService } from '@nestjs/axios';
import { UnrecoverableError } from 'bullmq';
import { of, throwError } from 'rxjs';

import { DailyMedClient } from './dailymed-client';

describe('DailyMedClient', () => {
  let client: DailyMedClient;
  let httpService: { get: jest.Mock };

  beforeEach(() => {
    httpService = { get: jest.fn() };
    client = new DailyMedClient(httpService as unknown as HttpService);
  });

  describe('fetchMetadata', () => {
    it('returns the spl_version as labelVersion when the setid is found', async () => {
      httpService.get.mockReturnValue(
        of({
          data: {
            data: [
              {
                setid: 'abc-123',
                spl_version: 13,
                published_date: 'Aug 21, 2026',
                title: 'TEST DRUG',
              },
            ],
          },
        }),
      );

      const result = await client.fetchMetadata('abc-123');

      expect(result).toEqual({ labelVersion: '13' });
      expect(httpService.get).toHaveBeenCalledWith(
        'https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json',
        { params: { setid: 'abc-123' }, timeout: 15_000 },
      );
    });

    it('throws UnrecoverableError when DailyMed returns an empty data array (setid not found)', async () => {
      httpService.get.mockReturnValue(of({ data: { data: [] } }));

      await expect(client.fetchMetadata('does-not-exist')).rejects.toThrow(
        UnrecoverableError,
      );
    });

    it('propagates a plain (retryable) error on a network failure', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('ECONNRESET')),
      );

      await expect(client.fetchMetadata('abc-123')).rejects.not.toBeInstanceOf(
        UnrecoverableError,
      );
    });
  });

  describe('fetchRawContent', () => {
    it('returns the raw SPL XML body', async () => {
      httpService.get.mockReturnValue(of({ data: '<document>...</document>' }));

      const result = await client.fetchRawContent('abc-123');

      expect(result).toBe('<document>...</document>');
      expect(httpService.get).toHaveBeenCalledWith(
        'https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/abc-123.xml',
        { responseType: 'text', timeout: 15_000 },
      );
    });

    it('propagates a failure (e.g. a 404 despite a found metadata match) as a plain error', async () => {
      httpService.get.mockReturnValue(throwError(() => new Error('404')));

      await expect(client.fetchRawContent('abc-123')).rejects.toThrow('404');
    });
  });
});
