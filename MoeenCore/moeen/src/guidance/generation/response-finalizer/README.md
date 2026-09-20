# response-finalizer — GN-3 T2

The last stage before a patient reads anything. Takes a dispatch result and
turns it into a `GuidanceResponse`: either the generated answer, or the
deterministic fallback rendered from the finding set.

```
ProviderDispatchResult ─┬─ outcome 'generated'        → ResponseValidator
                        │                                ├─ accepted → model text,   status 'accepted'
                        │                                └─ rejected → FallbackRenderer, status 'rejected_fallback'
                        └─ outcome 'fallback_required' → FallbackRenderer,            status 'rejected_fallback'
```

Every path returns text. No path throws, and no path returns an empty string.

## What the client sees, and what it does not

`GuidanceResponse` carries `text`, `citationIds`, `validationStatus` and
`promptVersion`. The refused candidate, the violations and the reason for the
fallback stay behind: they go to the log and to the retention store. A client
can tell that an answer is a fallback — it needs to, to label it — but not what
was refused or why.

`citationIds` is empty on every fallback. The deterministic text quotes
nothing, so it cites nothing; carrying the refused candidate's citations
forward would attach evidence to text that was not written from it.

Generated candidates also carry an internal `grounding` map with one exact
entry per response sentence. Validation requires complete ordered coverage,
checks every per-claim id against the retrieved set, and requires the public
`citationIds` to equal the map's unique union. A valid citation attached to one
sentence can no longer make a separate unsupported medicine claim pass.

These deterministic checks prove that the mapping is complete and that every
claimed source was actually retrieved. They do not prove semantic entailment
between an excerpt and a sentence; that remains a groundedness-evaluation and
human-review concern.

## Two ways to reach the fallback

`validationStatus` has two values because the client needs two. A reviewer
needs three, so `FallbackReason` on the retained record separates
`validation_rejected` (the rules refused a real candidate) from
`provider_unavailable` (there was never a candidate). Folding an outage into a
rejection rate would hide the outage.

## Retention is interim — one open item

`InMemoryRejectedCandidateStore` is the bound default: the last 200 refusals,
readable for the life of the process, gone on restart. That is enough for the
false-positive review this story asks for and not enough for anything else.

A durable store needs a table, and `database/schema/` is outside the folder
this story owns, so it is **not** written here. What it needs:

```ts
// database/schema/guidance-rejected-candidate.schema.ts
export const guidanceRejectedCandidate = pgTable('guidance_rejected_candidate', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => user.id, { onDelete: 'cascade' }),
  intent: guidanceIntentEnum('intent').notNull(),
  promptVersion: varchar('prompt_version', { length: 100 }),
  reason: guidanceFallbackReasonEnum('reason').notNull(), // validation_rejected | provider_unavailable
  candidateText: text('candidate_text').notNull(),
  citedIds: jsonb('cited_ids').$type<string[]>().notNull().default([]),
  suppliedCitationIds: jsonb('supplied_citation_ids').$type<string[]>().notNull().default([]),
  violations: jsonb('violations').$type<ValidationViolation[]>().notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

Reads of this table must never join into a patient-facing query — it holds text
that failed the rules, which is the one thing a patient may not be shown.

Swapping it in is one line in `response-finalizer.module.ts`:

```ts
{ provide: REJECTED_CANDIDATE_STORE, useClass: DrizzleRejectedCandidateStore }
```

`LoggingRejectedCandidateStore` is the alternative for an environment where
holding model output in process memory is unwanted.

## Wiring into the pipeline

`ResponseFinalizer.validate(dispatch, retrieval, promptVersion, context?)` is
shaped to satisfy `orchestrator/validator.port.ts` — the fourth argument is
optional precisely so it still is. Binding is one line in the module that owns
`VALIDATOR_PORT`, which is not this one.

Without that fourth argument the patient gets a correct but generic answer.
`FinalizeContext.safety` is what turns it into a summary of their own check,
and the orchestrator's placeholder port has no parameter for it — see the note
at the top of this story's handover.
