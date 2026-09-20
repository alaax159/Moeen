# Guidance prompt templates

Plain-text prompts, one per `GuidanceIntent`. They live as files, not as string
concatenation in code, so wording changes show up as a reviewable diff in a pull
request rather than buried in a service.

**These are safety-critical text.** A change to the wording here is a change to
what the model is allowed to say to a patient. Treat a diff in this folder the
way you would treat a diff in the safety engine.

## Files

| File                     | Intent                 |
| ------------------------ | ---------------------- |
| `missed_dose.md`         | `missed_dose`          |
| `explain_finding.md`     | `explain_finding`      |
| `medication_question.md` | `medication_question`  |
| `_shared-constraints.md` | partial, not an intent |

The filename is exactly the intent string, so lookup is a direct mapping with no
translation table. Files prefixed with `_` are partials and are never selected as
an intent template.

## The shared constraint block

`_shared-constraints.md` holds every rule that must hold for all three intents:
explain rather than prescribe, no dose numbers or schedule changes or diagnoses,
cite only supplied chunks, always refer, and treat findings as facts to explain
rather than conclusions to re-derive.

It exists once rather than three times on purpose. Three copies of a safety
invariant drift, and the drift is silent — one template gets updated, two do not,
and nobody notices until a patient sees the difference.

Each intent template pulls it in with an include marker:

```
{{> _shared-constraints }}
```

`prompt-assembler.templates.spec.ts` fails the build if any intent template is
missing that marker, or if the shared block loses one of its required clauses.

**Requirement for GN-1 T2:** the renderer must throw on an include marker it
cannot resolve. It must never render a prompt with the marker silently dropped or
left as literal text — that would put an unconstrained prompt in front of a
patient.

## Section delimiters

Each intent template is split into two messages:

```
--- SYSTEM ---
...becomes the system prompt...
--- USER ---
...becomes the user message...
```

## Placeholders

`{{name}}` is substituted by the assembler. The spec enforces that no template
uses a placeholder outside this list, so a typo fails the build rather than
rendering `{{medicatons}}` into a live prompt.

| Placeholder            | Source                                     |
| ---------------------- | ------------------------------------------ |
| `{{medications}}`      | `PatientScope.medications`                 |
| `{{conditions}}`       | `PatientScope.conditions`                  |
| `{{allergies}}`        | `PatientScope.allergies`                   |
| `{{findings}}`         | `PatientScope.findings`                    |
| `{{severity}}`         | `SafetyCheckResult.severity`, pre-resolved |
| `{{subjectMedication}}` | `subjectMedicationName`, resolved by caller |
| `{{excerpts}}`         | `RetrievedChunk[]`, rendered with ids      |
| `{{question}}`         | `GuidanceRequest.question`                 |

Every rendered value passes through the redactor before dispatch, so the model
sees `[PERSON_1]`-style placeholders in free text. Limit 6 of the shared block
tells it how to handle them.

## Open questions for sign-off

1. **Output format.** The templates require `text`, the response-level
   `citationIds`, and a `grounding` entry for every exact sentence. The
   validator rejects missing/reordered sentences and requires the response-level
   ids to equal the unique union of per-claim ids. `GuidanceResponse` exposes
   only the validated text and union; the grounding map stays internal.
2. **Response language.** Nothing in `GuidanceRequest` carries a language, so the
   templates do not mention one and the model will answer in whatever language
   the prompt is in. If patients write in Arabic, this needs a contract change.
3. **Urgent-symptom line.** Limit 7 lets the model say "seek urgent care" without
   naming a condition or judging severity. It is deliberately unconditional — it
   never varies with the finding severity, so it cannot become a triage decision.
   Confirm the team is comfortable with the model saying it at all.
