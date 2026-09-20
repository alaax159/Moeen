import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { firstValueFrom } from 'rxjs';

const DAILYMED_SPL_BASE_URL =
  'https://dailymed.nlm.nih.gov/dailymed/services/v2/spls';

// Without this, a hung connection blocks the BullMQ job indefinitely and
// the configured retry/backoff never gets a chance to run — caught in
// review (Ahmad Suleiman), not something the original tests exercised
// since mocked HttpService calls always resolve or reject immediately.
const REQUEST_TIMEOUT_MS = 15_000;

type DailyMedSplMetadataResponse = {
  data: Array<{
    setid: string;
    spl_version: number;
    published_date: string;
    title: string;
  }>;
};

export interface FetchedLabelMetadata {
  labelVersion: string;
}

@Injectable()
export class DailyMedClient {
  constructor(private readonly httpService: HttpService) {}

  /**
   * DailyMed's single-setid metadata form (/spls/{setid}.json) doesn't
   * exist — verified against the real API. The list form filtered by
   * setid does, and returns HTTP 200 with an empty data array when the
   * setid isn't recognized, never a 404 — checked here explicitly.
   *
   * Throws UnrecoverableError (skips remaining BullMQ retries — a setid
   * that doesn't exist will never start existing) for "not found", or a
   * plain Error (BullMQ retries per the queue's backoff config) for any
   * other failure.
   */
  async fetchMetadata(setId: string): Promise<FetchedLabelMetadata> {
    const response = await firstValueFrom(
      this.httpService.get<DailyMedSplMetadataResponse>(
        `${DAILYMED_SPL_BASE_URL}.json`,
        { params: { setid: setId }, timeout: REQUEST_TIMEOUT_MS },
      ),
    );

    const match = response.data.data[0];
    if (!match) {
      throw new UnrecoverableError(`DailyMed has no SPL for setid ${setId}`);
    }

    return { labelVersion: String(match.spl_version) };
  }

  /** Raw SPL XML document. 404 here is a genuine transient/data mismatch (metadata found it moments ago) — worth retrying, not unrecoverable. */
  async fetchRawContent(setId: string): Promise<string> {
    const response = await firstValueFrom(
      this.httpService.get<string>(`${DAILYMED_SPL_BASE_URL}/${setId}.xml`, {
        responseType: 'text',
        timeout: REQUEST_TIMEOUT_MS,
      }),
    );

    return response.data;
  }
}
