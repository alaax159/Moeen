import { Injectable, Optional } from '@nestjs/common';

import { GuidanceIntent, LabelSection } from '../contracts';

export interface IntentConfig {
  /**
   * PLACEHOLDER — KC-1 (Islam's label-ingestion story) hasn't started;
   * no real section taxonomy exists anywhere in the repo yet. Confirm real
   * section names with Islam before this becomes load-bearing.
   */
  retrievalSections: readonly LabelSection[];
  /** Matches one of GN-1's three template files by name (Alaa's story). */
  promptTemplateName: string;
  /** Which of GN-3's validation rule sets applies to this intent. */
  validationRuleSet: string;
}

function freezeConfig(config: IntentConfig): IntentConfig {
  Object.freeze(config.retrievalSections);
  return Object.freeze(config);
}

/**
 * Typed to GuidanceIntent, not a plain string — register() and get() only
 * accept the three real intents. A test that needs a throwaway fourth
 * intent still goes through this same typed API via an explicit
 * `as GuidanceIntent` cast at the call site, so extensibility doesn't
 * require loosening the type.
 *
 * Configs are frozen on the way in (constructor and register()), so get()
 * can safely hand back the stored reference — mutating it throws instead
 * of silently corrupting DEFAULT_INTENT_CONFIGS for every other instance.
 */
@Injectable()
export class IntentRegistry {
  private readonly configs = new Map<GuidanceIntent, IntentConfig>();

  constructor(@Optional() initial: Record<GuidanceIntent, IntentConfig> = DEFAULT_INTENT_CONFIGS) {
    for (const intent of Object.keys(initial) as GuidanceIntent[]) {
      this.configs.set(intent, freezeConfig(initial[intent]));
    }
  }

  register(intent: GuidanceIntent, config: IntentConfig): void {
    this.configs.set(intent, freezeConfig(config));
  }

  get(intent: GuidanceIntent): IntentConfig {
    const config = this.configs.get(intent);
    if (!config) throw new Error(`No intent config registered for "${intent}"`);
    return config;
  }
}

const DEFAULT_INTENT_CONFIGS: Record<GuidanceIntent, IntentConfig> = {
  missed_dose: { retrievalSections: ['dosage_and_administration', 'warnings'], promptTemplateName: 'missed_dose', validationRuleSet: 'standard' },
  explain_finding: { retrievalSections: ['warnings', 'drug_interactions'], promptTemplateName: 'explain_finding', validationRuleSet: 'standard' },
  medication_question: { retrievalSections: ['indications', 'warnings'], promptTemplateName: 'medication_question', validationRuleSet: 'standard' },
};
