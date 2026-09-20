# retriever

Builds `RetrievalResult` — the label evidence a `PatientScope` and a set of
target sections are allowed to see. Owned entirely by this folder;
`RetrievedChunk` / `RetrievalResult` themselves live in `guidance/contracts/`
and are frozen, not edited here.

## The query

One query (`RetrieverService.runEvidenceQuery`): `label_chunk` inner-joined to
`medication`, filtered in the `WHERE` clause on a medication boundary, the
intent's sections, and the active `embedding_model`/`embedding_version`, then
ordered by pgvector cosine distance and limited. The medication boundary is:

- `medication.generic_name IN (patient's ingredientNames)` for missed-dose
  and medication-question retrieval; or
- a correlated `EXISTS` through `user_medication` for `explain_finding`, using
  only the immutable finding's `subjectUserMedicationIds`.

These filters are metadata conditions applied by Postgres before any row is
touched by JavaScript — never a `.filter()` afterward. The generic-name and
section path was verified against a real throwaway `pgvector/pgvector:pg17`
container: `EXPLAIN ANALYZE` placed the filters before cosine-distance sorting,
and a patient scoped to `lisinopril`+`metformin` never received `warfarin` or
`aspirin` chunks. The exact-finding tests render the real Drizzle condition
through `PgDialect` and assert the correlated `EXISTS` plus its bound subject
IDs, including the absence of whole-regimen ingredient names.

## Embedding compatibility and upgrades

The ingestion provider declares a profile: model, version, and dimensions.
Every chunk stores the model and version that produced its vector. Query text
is embedded by the same provider binding, and retrieval includes an exact
profile match in SQL before any row can be returned. Vectors from different
spaces are therefore never compared as if they were compatible.

Provider profiles and returned vectors are validated before database access:
the profile must match pgvector's fixed dimensions, every value must be finite,
and zero vectors are rejected because cosine distance is undefined for them.

At startup, `LabelIngestionReconciler` finds fetched label documents with no
chunks or any chunk from a different profile and enqueues local `process-label`
work. The BullMQ job ID includes a hash of the active profile, so a completed
job retained under the old profile cannot suppress an embedding upgrade.
Reprocessing uses persisted raw SPL and does not refetch DailyMed.
All chunks for one label version are rewritten and trimmed in one database
transaction, so retrieval cannot observe a half-upgraded document.

## Exact-finding boundary

`explain_finding` is a discriminated retrieval contract: callers must provide
`findingSubjectUserMedicationIds`. The orchestrator obtains them only after the
scope builder has loaded one immutable finding by UUID and verified patient
ownership. The IDs remain internal to retrieval rather than being added to
the formatted model prompt. `ScopeFormatter` also omits the IDs already carried
inside persisted findings.

The correlated `EXISTS` maps each finding subject from `user_medication.id` to
the catalog `medication.id` stored on `label_chunk`. `EXISTS` avoids duplicate
chunks when two subject records refer to the same catalog medication. An empty
subject list returns explicit no-evidence before embedding; it never falls back
to all active medicines. Invalid IDs are rejected before database access.

Other intents still use exact `generic_name` equality. `PatientScope` carries
only generic ingredient names, sourced from that same database column, so this
is not a fuzzy or brand-name lookup.

## T2 — weighting, config, no-evidence

- **`k` and the similarity threshold are `ConfigService` reads**
  (`RETRIEVER_K`, `RETRIEVER_SIMILARITY_THRESHOLD`), not hardcoded constants
  — same pattern already used by `rxnorm.service.ts`
  (`Number(configService.get<string>(...) ?? default)`, with a sanity check
  that falls back to the default on a bad/missing value). Defaults: `k = 8`,
  similarity threshold `= 0.5` (a minimum cosine similarity, converted to a
  max cosine distance of `1 - threshold` for the SQL comparison) — both
  untuned starting points.
- **The threshold is a `WHERE` clause** (`distance <= maxDistance`), applied
  in the same query as the medication/section filter — a below-threshold row
  never reaches JavaScript to be filtered out there.
- **Section priority** (`section-priority.ts`) is a per-`GuidanceIntent` map,
  not configuration — it's domain judgment (which sections matter most for
  which question), not an ops knob. Rendered as a SQL `CASE` and used as the
  _primary_ `ORDER BY` key, with cosine distance as the tiebreak within a
  priority tier — so a less-similar `warnings` chunk can still outrank a
  more-similar `indications` chunk for an interaction question, exactly as
  asked. Not wired into `orchestrator/intent-registry.ts` (Salam's file,
  off-limits) — it's a ranking preference applied within whatever `sections`
  `retrieve()` is called with, independent of that file's own (unordered)
  filter list.
- **Zero-row handling was already correct from T1** (`RetrievalResult`'s own
  type makes `{ found: false }` the only way to represent "nothing," never an
  empty `chunks: []`) — T2 didn't need to add anything there; a row excluded
  by the threshold just means fewer rows reach that same existing check.

All three verified against a live throwaway `pgvector` container, not just
mocks: seeded three chunks at known, exact cosine distances (built as
`cos(θ)·e1 + sin(θ)·e2` against the query vector, so the similarity is exact,
not incidental) — a close `indications` chunk, a mid-distance `warnings`
chunk, and a far `indications` chunk below the threshold. Real
`RetrieverService.retrieve()` calls confirmed: the far chunk was excluded;
the mid-distance `warnings` chunk ranked _above_ the closer `indications`
chunk for `explain_finding`; tightening `RETRIEVER_SIMILARITY_THRESHOLD` via
config excluded the mid-distance chunk too; setting `RETRIEVER_K=1` capped
the result to one row.

## T3 — leakage suite and the mock

**Leakage suite** (`retriever.leakage.spec.ts`): a mocked db just returns
whatever rows it's handed regardless of the WHERE clause, so it can't prove
the filter is actually safe — only real SQL, rendered through drizzle's own
`PgDialect`, can. Every test in this suite captures the real SQL condition
object the service builds and inspects the rendered text/params, not the
(irrelevant, mocked) row data. Attempts tried: relying on a wide default
filter, reusing service/db state across two different patients' calls,
asking for a section outside the given list, injecting SQL through a
malicious `ingredientName`, and using `subjectMedicationId` to widen access.
All failed to leak anything. Complemented by a live run against a real
pgvector container (see T1's methodology) with attacks mocks can't prove:
a same-name-different-case medication, a superstring medication name
(`warfarin sodium` vs. `warfarin`), and actually executing (not just
inspecting) the SQL-injection attempt — the query completed safely and
`label_chunk` was untouched. A legitimate case (two real catalog rows
sharing one generic name) correctly returned both, confirming the filter
isn't accidentally over-restrictive either.

**`MockRetrieverService`** (`guidance/__fixtures__/mock-retriever-service.ts`):
same shape as `MockSafetyResultAdapter` — zero constructor dependencies (no
db, no embedding provider), returns a configurable fixture `RetrievalResult`
(`retrievalResultFixtures.found` by default), exported from
`guidance/__fixtures__` for Salam and Alaa to build against without needing
a database.

**Known, non-blocking limitation** (flagged in review on !529): `retrieve()`
takes no arguments and ignores whatever it's called with, so this mock can
prove a result comes back but can't assert what the orchestrator actually
passed to retrieval. Deliberate, matching `MockSafetyResultAdapter` — the
real assertions on call arguments live in `retriever.service.spec.ts`
instead. Worth a real fix only if a consumer test ever needs to assert on
retrieval inputs specifically.

## Resolved with Salam: the query-text input

`RetrieveEvidenceParams.question` is optional, mapped straight from
`GuidanceRequest.question` (only `medication_question` ever populates it).
Confirmed with Salam that at the orchestrator's call site, `request.intent`,
`request.question`, and `intentConfig.retrievalSections` are all already in
scope — assembling `{ scope, intent, sections, question }` is just reading
values already available, not new plumbing on the orchestrator's side.

When `question` is absent, `query-text.ts` derives a default per intent —
`explain_finding` prefers the safety engine's own `findings[].rationale`
text over a generic fallback, since it's more specific; `missed_dose` and a
question-less `medication_question` fall back to a synthesized string naming
the patient's medications. This is retrieval strategy — this folder's own
call to make, not something to push onto the orchestrator, per Salam.

On the `RetrieverPort`/`RETRIEVER_PORT` duplication: also resolved.
Convergence follows the pattern already settled twice in this codebase
(`SafetyResultPort`, `PatientScopeBuilderPort` — both owned and colocated
with their real implementation, never duplicated by whoever consumes them).
Once `orchestrator/retriever.port.ts`'s placeholder is deleted and Salam's
orchestrator imports `RetrieverPort`/`RETRIEVER_PORT` straight from this
file, the same-named-but-distinct-symbol problem goes away on its own.

## What must never enter a chunk

Per `RetrievedChunk`'s own contract: nothing beyond `citationId`, `setId`,
`section`, `text` — no medication name, no patient data of any kind. The
query never selects patient-identifying columns; nothing here spreads a full
row onto the output.
