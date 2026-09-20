import { Injectable } from '@nestjs/common';
import { RetrievalResult } from '../contracts';
import { RetrieverPort } from '../context/retriever/retriever.port';
import { retrievalResultFixtures } from './retrieved-chunks.fixture';

@Injectable()
export class MockRetrieverService implements RetrieverPort {
  private current: RetrievalResult = retrievalResultFixtures.found;

  setResult(result: RetrievalResult): void {
    this.current = result;
  }

  retrieve(): Promise<RetrievalResult> {
    return Promise.resolve(this.current);
  }
}
