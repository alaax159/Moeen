import { Injectable, Logger } from '@nestjs/common';

/**
 * Emits the per-request redaction counter. A log line rather than a metrics
 * backend because none is in this stack yet — swap the body out, not the
 * call sites, if/when one is added.
 */
@Injectable()
export class RedactionMetrics {
  private readonly logger = new Logger(RedactionMetrics.name);

  recordRedactionCount(count: number): void {
    this.logger.log(`redaction_count=${count}`);
  }
}
