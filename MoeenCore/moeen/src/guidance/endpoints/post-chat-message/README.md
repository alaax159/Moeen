# POST chat message

Authenticated patient endpoint:

`POST /chat/messages`

The request accepts a message, an optional existing `sessionId`, and an optional
`subjectMedicationId`.

A new `chat_session` is created when no session is supplied. Existing sessions
are accepted only when they belong to the authenticated patient.

The user turn is persisted before generation. Every generated response routes
through `PipelineOrchestrator` using the `medication_question` intent and the
`patient_chat` audit trigger. The assistant turn is persisted with citations,
validation status and prompt version.

## Streaming contract

The current provider/orchestrator contract returns a complete validated
`GuidanceResponse`; it does not expose raw provider token streaming.

For that reason this endpoint intentionally waits for validation and persistence
before exposing any generated text to the patient. It then delivers the safe
final response incrementally using `text/event-stream` events:

- `session` — contains the chat session id.
- `delta` — contains one incremental text chunk.
- `done` — contains citations, validation status and prompt version.

This preserves the rule that unvalidated model output must never reach the
patient.

## Upstream integration dependency

At the time this endpoint was implemented, `OrchestratorModule` on main still
bound its assembler, validator and audit hook to placeholder/no-op providers.
The endpoint deliberately does not bypass the orchestrator or call the model
provider directly. Production end-to-end operation therefore depends on the
orchestrator owner completing the real stage and audit wiring.

## Reliability and retries

Each request must include a client-generated UUID `requestId`.

The `requestId` acts as the idempotency key. Retrying the same request does not
create another user turn or another chat session. If the assistant response was
already persisted, the stored response is returned without running the
orchestrator again.

For a new conversation, creation of the chat session and persistence of the
initial user message happen in one database transaction.

The SSE writer also stops cleanly when the client disconnects or the response
emits `close` or `error` while waiting for backpressure to drain.

## Concurrent retries

A user turn has a request processing state: `processing`, `completed`, or
`failed`.

Only the request that successfully creates the turn, or atomically claims a
failed turn, may call the orchestrator. A concurrent request for the same
`requestId` while processing receives a conflict response instead of causing a
duplicate model call.

The assistant turn and the transition to `completed` are persisted in one
database transaction. Generation failures move the user turn to `failed`, which
allows a later retry to atomically claim it.

## Intent classification, refusal and history window

Patient chat classification is deterministic and runs before the orchestrator.

Requests asking Moeen to diagnose a condition or recommend a dose, frequency,
schedule, start/stop or similar treatment change receive one standard refusal
plus a doctor/pharmacist referral. The orchestrator is not called for these
requests.

For patient-chat guidance requests, `subjectMedicationId` is treated as the
patient-owned `user_medication.id` and is required before model-backed guidance
can run. It must identify one of the patient's `active` + `ongoing`
medications. A missing, inactive, completed, archived, or other-patient
medication fails closed to the same deterministic refusal without calling the
orchestrator.

Explicit missed-dose language is routed to the existing `missed_dose` intent.
Other in-scope informational medication questions use `medication_question`.
`explain_finding` is not inferred from free text because safely selecting that
intent requires the specific safety-warning identifier carried separately by
the frozen guidance contract.

For `medication_question`, completed prior exchanges are loaded in chronological
order and trimmed to the newest contiguous complete window that fits
`CHAT_HISTORY_TOKEN_BUDGET`. The default is 1200 tokens. Set the value to `0`
to disable history. Incomplete or failed exchanges are never sent, and a single
oversized newest exchange is dropped rather than split into partial medical
context.

The trimmed history is placed inside the existing `question` string instead of
changing `guidance/contracts/`, which remains frozen.
