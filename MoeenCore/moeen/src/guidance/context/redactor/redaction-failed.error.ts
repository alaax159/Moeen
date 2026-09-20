/**
 * Thrown whenever the redactor cannot guarantee a payload has been safely
 * redacted. The caller must let this propagate and abort the call — never
 * catch it and fall back to sending the unredacted payload.
 */
export class RedactionFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedactionFailedError';
  }
}
