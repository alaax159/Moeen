export type RedactionCategory = 'PERSON' | 'EMAIL' | 'PHONE' | 'DATE' | 'ID';

/**
 * Holds the value-to-placeholder map for one pipeline run. Create one
 * instance per request and thread it through every redact() call made
 * during that request — across the scope, the retrieved chunks, the
 * question, whatever else gets redacted — so a value that recurs anywhere
 * in the request keeps the same placeholder throughout.
 */
export class RedactionContext {
  private readonly placeholders = new Map<string, string>();
  private readonly counters: Record<RedactionCategory, number> = {
    PERSON: 0,
    EMAIL: 0,
    PHONE: 0,
    DATE: 0,
    ID: 0,
  };

  placeholderFor(category: RedactionCategory, key: string): string {
    const mapKey = `${category}:${key}`;
    const existing = this.placeholders.get(mapKey);
    if (existing) return existing;

    this.counters[category] += 1;
    const placeholder = `[${category}_${this.counters[category]}]`;
    this.placeholders.set(mapKey, placeholder);
    return placeholder;
  }

  /** Count of distinct values substituted so far in this request — the redaction counter the gateway emits per call. */
  totalRedactions(): number {
    return Object.values(this.counters).reduce((sum, n) => sum + n, 0);
  }
}
