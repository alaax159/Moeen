/**
 * Thrown whenever a prompt cannot be assembled exactly as its template
 * specifies — a missing partial, an unresolved include, a placeholder with no
 * value. The caller must let this propagate and abort the request. A prompt
 * that is only mostly assembled is a prompt whose constraints may be missing,
 * and that must never reach a provider.
 */
export class PromptAssemblyFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptAssemblyFailedError';
  }
}
