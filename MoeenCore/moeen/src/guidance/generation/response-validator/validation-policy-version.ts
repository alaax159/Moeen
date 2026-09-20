/**
 * Cache and audit fence for the deterministic response policy.
 *
 * Bump this whenever a validation rule changes which previously accepted
 * responses are safe to reuse. Prompt versions only describe model input;
 * they cannot invalidate output accepted under an older validator.
 */
export const VALIDATION_POLICY_VERSION = 'gn3.2';
