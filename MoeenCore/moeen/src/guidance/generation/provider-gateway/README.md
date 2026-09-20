# Provider gateway (CX-3 + GN-2)

The single exit point to a model provider. Nothing else in the codebase is
permitted to make an outbound model call — `provider-gateway.module.ts` never
exports `LLM_PROVIDER`, and `provider-gateway.architecture.spec.ts` fails the
build if any file outside this folder so much as names the token.

## Developing against the stub

`GENERATION_PROVIDER` defaults to `stub`, so a fresh checkout runs the whole
pipeline with no Foundry account, no key, no network and no cost. The stub is a
team deliverable, not a test double: it answers through the same `LlmProviderPort`
as the real adapter, returns the `{"text": …, "citationIds": […]}` envelope the
GN-1 templates ask for, and echoes back only the citation ids the prompt
actually supplied — so a local run produces output GN-3's validator will accept.

Switching to the real provider is one key:

```
GENERATION_PROVIDER=foundry
FOUNDRY_ENDPOINT=https://<resource>.services.ai.azure.com
FOUNDRY_API_KEY=<key>
```

## What `dispatch()` guarantees

It returns for every provider problem and throws for exactly one thing.

- Timeout, outage, 4xx, refusal, open circuit, rate limit, kill switch → a
  resolved `ProviderDispatchResult` with `outcome: 'fallback_required'` and a
  typed `failure`. `text` is `''`. Nothing upstream breaks.
- `RedactionFailedError` → still thrown. An outage should degrade; a privacy
  failure must stop.

Rendering deterministic text from that fallback signal is GN-3 T2, not this
folder.

Pass the optional third argument — `{ patientId, intent }` — or the per-patient
rate limit cannot apply and no `guidance_call` row can be written.

## Config keys

Defaults live in `GENERATION_CONFIG_DEFAULTS` in `generation.config.ts`; every
key below works unset.

| Key | Default | What it does |
| --- | --- | --- |
| `GENERATION_ENABLED` | `true` | Kill switch. `false` disables generative output entirely; the pipeline still answers, and no `guidance_call` row is written because no call was made. |
| `GENERATION_PROVIDER` | `stub` | `stub` or `foundry`. The only switch between them. |
| `GENERATION_TIMEOUT_MS` | `15000` | Per-attempt wall clock. Exceeding it aborts the call and returns a typed failure. |
| `GENERATION_MAX_ATTEMPTS` | `2` | Initial attempt plus one retry. Clamped to at least 1. |
| `GENERATION_RETRY_DELAY_MS` | `250` | Wait before the retry. |
| `GENERATION_MAX_OUTPUT_TOKENS` | `700` | Sent as `max_completion_tokens`. |
| `GENERATION_BREAKER_FAILURE_THRESHOLD` | `5` | Consecutive qualifying failures that open the circuit. |
| `GENERATION_BREAKER_COOLDOWN_MS` | `30000` | How long it stays open before admitting one probe. |
| `GENERATION_BREAKER_PROBE_SUCCESSES` | `1` | Probe successes needed to close it again. |
| `GENERATION_PATIENT_RATE_LIMIT` | `10` | Calls per patient per window. |
| `GENERATION_PATIENT_RATE_WINDOW_MS` | `60000` | That window. |
| `GENERATION_GLOBAL_RATE_LIMIT` | `300` | Calls across the process per window. |
| `GENERATION_GLOBAL_RATE_WINDOW_MS` | `60000` | That window. |
| `GENERATION_STUB_LATENCY_MS` | `0` | Artificial delay the stub sleeps for, so local work can feel a real call. |
| `FOUNDRY_ENDPOINT` | *(empty)* | Required when `GENERATION_PROVIDER=foundry`. |
| `FOUNDRY_API_KEY` | *(empty)* | Required when `GENERATION_PROVIDER=foundry`. |
| `FOUNDRY_DEPLOYMENT` | `gpt-5.4-mini` | The deployment name in Foundry, not the vendor model id. |
| `FOUNDRY_API_VERSION` | `2024-12-01-preview` | Azure API version. |

## Deliberate choices worth knowing about

- **Every 4xx is permanent, 429 included.** Resending identical bytes to a
  provider that just said "over quota" does not make us under quota. Our own
  rate limits are what keep us under theirs; if 429s appear in `guidance_call`,
  lower `GENERATION_GLOBAL_RATE_LIMIT` rather than retrying harder.
- **Refusals and 4xx do not open the circuit.** A content filter saying no is a
  healthy provider, and a malformed request is our bug. Only timeouts and
  transient failures count.
- **The breaker and the rate limiter are in-memory**, so their state is per
  process. With N instances the effective global limit is N times the
  configured value. Redis is already in the stack and is the obvious home for a
  shared counter when we run more than one instance.
