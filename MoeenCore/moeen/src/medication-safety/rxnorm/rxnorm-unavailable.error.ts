export class RxNormUnavailableError extends Error {
  constructor(public readonly inputName: string) {
    super(`RxNorm service is unavailable while resolving "${inputName}"`);
    this.name = 'RxNormUnavailableError';
  }
}
