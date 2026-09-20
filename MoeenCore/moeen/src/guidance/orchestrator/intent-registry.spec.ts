import { IntentRegistry, IntentConfig } from './intent-registry';
import { GuidanceIntent, LabelSection } from '../contracts';

describe('IntentRegistry', () => {
  it('resolves config for each of the three real intents', () => {
    const registry = new IntentRegistry();
    expect(registry.get('missed_dose')).toBeDefined();
    expect(registry.get('explain_finding')).toBeDefined();
    expect(registry.get('medication_question')).toBeDefined();
  });

  it('throws for an intent with no registered config', () => {
    expect(() => new IntentRegistry().get('not_a_real_intent' as GuidanceIntent)).toThrow();
  });

  it('accepts a throwaway fourth intent for this test alone, no orchestrator change needed', () => {
    const registry = new IntentRegistry();
    const throwaway: IntentConfig = { retrievalSections: ['indications'], promptTemplateName: 'test_template', validationRuleSet: 'test' };

    registry.register('test_only_intent' as GuidanceIntent, throwaway);

    expect(registry.get('test_only_intent' as GuidanceIntent)).toEqual(throwaway);
  });

  it('does not let mutating a returned config affect the registry', () => {
    const registry = new IntentRegistry();
    const config = registry.get('missed_dose');

    expect(() => (config.retrievalSections as LabelSection[]).push('warnings')).toThrow();
  });
});
