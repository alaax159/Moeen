# Get explanation

`GET /safety-checks/:id/explanation` explains one immutable safety finding.
`:id` must be a UUID from `medication_safety_finding.id`; it is not a safety
run ID and is not a legacy numeric warning ID.

## Flow

1. `SafetyResultPort.getFindingById(id, patientId)` loads the finding, its
   parent run, checker coverage, and relevant evidence only when the run still
   matches the patient's current safety-context version and active subject
   medication.
2. The service returns the same not-found response when the finding is absent
   or belongs to another patient, avoiding cross-patient ID disclosure.
3. A policy-versioned hash of the exact immutable run and finding is checked
   in `finding_explanation`. Only an accepted cache hit is returned without
   generation; legacy fallback rows are treated as misses.
4. A cache miss calls the orchestrator with `intent: 'explain_finding'` and
   `subjectSafetyCheckId: id`. The scope builder therefore supplies only the
   requested finding rather than all current findings. The orchestrator passes
   only that finding's `subjectUserMedicationIds` to retrieval, where a SQL
   `EXISTS` fence limits label evidence to those medications.
5. The independent severity-language guard replaces unsafe minimizing
   language through the pipeline's shared deterministic fallback renderer.
   Fixed patient-facing copy is used; unvalidated clinical rationale is never
   exposed through the failure path.
6. Accepted post-guard responses are cached and citation IDs are resolved to
   label section metadata. Fallbacks are returned for that request but never
   cached, so a temporary outage or rejection does not become permanent.

Cache reads and writes are best-effort. Concurrent misses for the same
run/finding share one in-process generation. If a pipeline stage fails, the
current finding still produces deterministic text instead of an HTTP 500.

The finding lookup and run lookup are separate adapter methods so a UUID can
never be accidentally interpreted as the other entity type. Stale, inactive,
foreign, and nonexistent findings all return the same not-found response.

## Cache boundary

The cache hash covers the safety run ID, patient ID, context hash, engine and
dataset versions, exact finding content, prompt version, and deterministic
validation-policy version. Object and evidence ordering is canonicalized so
equivalent provenance produces the same key. A later safety run cannot reuse
an explanation generated for an earlier run, even when both runs found the
same clinical issue.

`VALIDATION_POLICY_VERSION` must be bumped when a rule change makes an older
accepted response unsafe to reuse, independently of prompt-version changes.
