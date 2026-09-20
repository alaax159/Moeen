import { GuidanceIntent, LabelSection } from '../../contracts';

/**
 * Lower number = ranked first. Not tied to orchestrator/intent-registry.ts's
 * retrievalSections (that's Salam's file, off-limits to edit, and it's an
 * unordered filter list anyway) — this is purely a ranking preference
 * applied within whatever sections retrieve() is called with. A section not
 * listed here for a given intent falls back to DEFAULT_PRIORITY, so this
 * only needs to name the sections worth boosting, not every section.
 *
 * missed_dose's own priority is a judgment call, not spelled out in the
 * task prompt the way the interaction-question example was — dosing
 * instructions matter most when a dose was missed, warnings second.
 */
const TOP_PRIORITY = 0;
const DEFAULT_PRIORITY = 1;

const SECTION_PRIORITY_BY_INTENT: Record<
  GuidanceIntent,
  Partial<Record<LabelSection, number>>
> = {
  explain_finding: { drug_interactions: TOP_PRIORITY, warnings: TOP_PRIORITY },
  medication_question: {
    warnings: TOP_PRIORITY,
    drug_interactions: TOP_PRIORITY,
  },
  missed_dose: { dosage_and_administration: TOP_PRIORITY },
};

export function sectionPriority(
  intent: GuidanceIntent,
  section: LabelSection,
): number {
  return SECTION_PRIORITY_BY_INTENT[intent][section] ?? DEFAULT_PRIORITY;
}
