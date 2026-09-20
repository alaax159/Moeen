# Scope builder

`PatientScopeBuilder` creates the minimized patient context that guidance and
RAG are allowed to consume. It selects every field explicitly and never caches
the result.

## Allowed context

| Scope field                       | Source and rule                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `medications[]`                   | Generic ingredient name, frequency, and time-of-day slots for active, ongoing `user_medication` rows  |
| `conditions[]`                    | Active chronic-condition concepts, reduced to code and name                                           |
| `allergies[]`                     | Active allergy concepts, reduced to code and name                                                     |
| `safetyRunId`                     | The immutable safety run selected through `SafetyResultPort`, or a synthetic `no-safety-run-*` marker |
| `safetyCoverage`                  | Persisted checker coverage; passed through without reinterpretation                                   |
| `safetySeverity` and `findings[]` | Persisted safety result; passed through without re-ranking                                            |
| `subjectMedicationId`             | Included only when supplied by the caller                                                             |

Names, contact information, dates of birth, instructions, notes, reactions,
and other free text are deliberately excluded. Adding a database column cannot
make it enter the scope automatically because no query selects whole rows.

## Safety selection

The two explicit selectors have different meanings and cannot be combined:

- `subjectSafetyCheckId` is an immutable
  `medication_safety_finding.id` UUID. The builder uses `getFindingById` and
  returns only that finding while its run still matches the patient's current
  safety-context version and active subject medication. A stale or missing
  finding, or one owned by another patient, fails with the same error; it never
  widens to the latest result.
- `safetyRunId` is an immutable `medication_safety_run.id` UUID. The builder
  uses `getCurrentRunForPatient`, which accepts the run only when it belongs to
  the patient, matches the current patient context version, and still refers to
  an active/ongoing subject medication. A stale, missing, or mismatched run is
  represented as unverified safety, never replaced by another latest run.

`safetyRunId: null` means the caller attempted safety but no run was available.
It deliberately produces unverified coverage. Omitting `safetyRunId` permits
interactive callers to request the latest current run.

When both the selected run and request identify a subject medication, their
IDs must match. A mismatch fails before retrieval or generation.

## Downstream guard

The orchestrator forwards both selectors into this builder. If returned safety
coverage is anything other than `complete`, the pipeline uses deterministic
safety fallback and skips retrieval, prompt assembly, and the model provider.
