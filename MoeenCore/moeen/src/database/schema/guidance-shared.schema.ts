import { pgEnum } from 'drizzle-orm/pg-core';

// Shared across guidance_call and audit_log — Postgres enum types are
// global by name, so this lives in one place rather than being redeclared
// per table.
export const guidanceIntentEnum = pgEnum('guidance_intent', [
  'missed_dose',
  'explain_finding',
  'medication_question',
]);

// PROVISIONAL — see guidance/contracts/guidance-response.contract.ts. The
// day-zero doc only describes the two outcomes in prose, not as a named
// enum. Flagged for team sign-off before contracts/ is frozen.
export const validationStatusEnum = pgEnum('validation_status', [
  'accepted',
  'rejected_fallback',
]);
