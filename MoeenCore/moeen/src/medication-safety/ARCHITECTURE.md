# Medication safety run flow

The deterministic safety engine is the authority for safety state. Guidance
and RAG consume its persisted result; they do not rerun, reinterpret, or
promote checker output.

```text
patient-context mutation (same database transaction)
  -> advance patient_safety_state.context_version
  -> medication_safety_recheck_outbox (one row per active medication)
     -> leased worker + bounded retry/dead-letter
     -> domain trigger
  -> MedicationSafetyRouterService
     -> capture minimized patient context + hash + context version
     -> run each required checker independently
     -> resolve checker coverage, outcome, and severity
     -> MedicationSafetyRunRepository (one transaction)
        -> immutable run
        -> checker results
        -> findings + evidence
        -> guarded current-check/current-finding projections
  -> SafetyResultAdapter
     -> PatientScopeBuilder
        -> complete coverage: retriever -> prompt -> validator -> response
        -> incomplete coverage: deterministic fallback (no RAG/model call)
```

Missed-dose jobs use a stricter run-bound path:

```text
mark dose missed
  -> safety trigger with idempotency key dose-missed:<doseLogId>
  -> immutable safety run id (or explicit unavailable/null)
  -> guidance request carrying that exact safety run id
  -> current-context fence in SafetyResultAdapter
  -> guidance cache + audit row retain safety_run_id
```

If safety is unavailable, the first attempt stores only deterministic
unverified guidance and rethrows the safety error so BullMQ retries. The retry
reuses the same safety idempotency key and replaces the cached fallback with
guidance tied to the recovered exact run. It never substitutes an unrelated
latest run.

RAG also fences the vector space used for evidence:

```text
embedding provider profile (model + version + fixed dimensions)
  -> label ingestion validates vectors and stores profile on every chunk
  -> startup reconciliation reprocesses missing/mismatched profiles
  -> retrieval embeds the query with the active profile
  -> SQL filters medication + section + exact embedding profile
```

This makes an embedding upgrade fail closed (temporarily no evidence) instead
of comparing vectors created by incompatible models.

Finding explanations add another SQL boundary:

```text
immutable medication_safety_finding UUID
  -> patient-owned exact finding from SafetyResultAdapter
  -> orchestrator forwards only its subject user_medication IDs
  -> retriever maps those IDs to catalog medications with correlated EXISTS
  -> SQL returns label chunks only for the medications in that finding
```

The retrieval selector and the IDs inside persisted findings are never rendered
into the model prompt. A finding with no remaining medication subjects produces
no RAG evidence rather than widening to the patient's entire regimen.

Grounding remains claim-scoped after retrieval:

```text
retrieved chunk citation IDs
  -> prompt requires one grounding entry per exact response sentence
  -> validator checks complete ordered sentence coverage
  -> each claim's citations are checked against the retrieved set
  -> public citationIds must equal the per-claim union
```

This prevents a valid citation on one sentence from laundering an unsupported
medicine claim elsewhere in the answer. Invalid grounding rejects the whole
candidate and uses deterministic fallback; it is never repaired in place.

## Invariants

- `clear` requires complete checker coverage and zero findings.
- Unknown data, unavailable providers, and checker failures are coverage
  states, never clinical findings and never proof of safety.
- Every persisted finding carries exact `user_medication` IDs and, when
  relevant, exact user allergy/condition IDs from the captured patient
  context. Cross-patient references fail before a transaction starts.
- A run, its checker results, findings, evidence, and projection changes are
  committed atomically. Persistence errors are not swallowed.
- A newer complete checker result replaces that checker's current findings;
  a partial result may add confirmed findings but cannot remove earlier ones;
  unavailable/failed results leave findings untouched.
- Projection updates are time-guarded, so an older run finishing late cannot
  supersede a newer result.
- Medication, allergy, condition, and knowledge edits atomically advance a
  monotonic patient context version and enqueue durable rechecks. Guidance
  accepts only runs matching the current version, so a stale run can remain in
  the audit history but can never be presented as current safety state.
- Outbox work is claimed with `SKIP LOCKED`, has a lease for crash recovery,
  uses a stable run idempotency key, retries with backoff, and dead-letters
  after the bounded attempt count.
- Missed-dose checks update only their required checker (`drug_drug`). They do
  not clear allergy or condition projections.
- Guidance reads immutable runs through `SafetyResultPort`. The adapter
  validates stored coverage/outcome metadata before exposing it to RAG.
- An explicit run lookup is fenced by patient ownership, current context
  version, and active subject medication. Missing or stale exact runs become
  unverified and cannot fall back to a different latest run.
- Finding explanations resolve immutable finding UUIDs through a distinct
  lookup; run UUIDs and finding UUIDs are never treated as interchangeable.
- Retrieval and generation require complete safety coverage. Partial,
  unavailable, or failed coverage is rendered deterministically.
