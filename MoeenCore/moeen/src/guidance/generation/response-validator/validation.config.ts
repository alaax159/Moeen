import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * GN-3's knobs, kept out of GENERATION_CONFIG_DEFAULTS on purpose: those are
 * GN-2's provider knobs, and the two get tuned by different people for
 * different reasons. Someone loosening the validator should not be reading
 * past circuit-breaker settings to find the line they want.
 */
export const VALIDATION_CONFIG_DEFAULTS = {
  /**
   * Upper bound on what a patient sees. The templates ask for two or three
   * short paragraphs; this is roughly double that, so it catches a runaway
   * answer rather than policing style.
   */
  VALIDATION_MAX_RESPONSE_CHARS: 1200,
} as const;

@Injectable()
export class ValidationConfig {
  constructor(private readonly config: ConfigService) {}

  get maxResponseChars(): number {
    const fallback = VALIDATION_CONFIG_DEFAULTS.VALIDATION_MAX_RESPONSE_CHARS;
    const raw = this.config.get<string | number>(
      'VALIDATION_MAX_RESPONSE_CHARS',
    );
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0
      ? Math.trunc(parsed)
      : fallback;
  }
}
