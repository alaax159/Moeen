/**
 * MANUAL smoke check against the real Foundry deployment.
 *
 *   npm run check:foundry
 *   npm run check:foundry -- missed_dose
 *   npm run check:foundry -- explain_finding --no-evidence
 *   npm run check:foundry -- --show-request        (dump the HTTP body sent)
 *   npm run check:foundry -- --show-request --full  (untruncated prompts)
 *
 * Deliberately NOT a `.spec.ts` file, so jest cannot pick it up. This makes a
 * real, billed model call: no test in this repo is allowed to do that, and
 * this must never be added to the CI suite. It exists to answer one question a
 * unit test cannot — "does our key, endpoint and deployment actually work,
 * and does the real model respect the GN-1 constraints?"
 *
 * Everything it exercises is real: the GN-1 assembler and its templates, the
 * CX-3 redactor, the GN-2 gateway, breaker, limiter and Foundry adapter. Only
 * the patient data is a fixture, and the guidance_call row is printed instead
 * of written.
 */
import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

import type { GuidanceIntent } from '../../contracts';
import { Redactor } from '../../context/redactor/redactor.service';
import { PromptAssembler } from '../prompt-assembler/prompt-assembler.service';
import { TemplateLoader } from '../prompt-assembler/template-loader.service';
import { TemplateRenderer } from '../prompt-assembler/template-renderer.service';
import { ScopeFormatter } from '../prompt-assembler/scope-formatter.service';
import { ChunkFormatter } from '../prompt-assembler/chunk-formatter.service';
import { patientScopeFixtures } from '../../__fixtures__/patient-scopes.fixture';
import { retrievalResultFixtures } from '../../__fixtures__/retrieved-chunks.fixture';

import { GenerationConfig } from './generation.config';
import { CircuitBreaker } from './circuit-breaker.service';
import { GuidanceRateLimiter } from './guidance-rate-limiter.service';
import { LlmCallExecutor } from './llm-call-executor.service';
import { FoundryLlmProvider } from './foundry-llm.provider';
import { StubLlmProvider } from './stub-llm.provider';
import { ProviderGateway } from './provider-gateway.service';
import { RedactionMetrics } from './redaction-metrics.service';
import {
  GuidanceCallRecord,
  GuidanceCallRecorderPort,
} from './guidance-call-recorder.port';

const INTENTS: GuidanceIntent[] = [
  'explain_finding',
  'missed_dose',
  'medication_question',
];

/** Prints the row instead of writing it — this check must not need a database. */
class PrintingRecorder implements GuidanceCallRecorderPort {
  row?: GuidanceCallRecord;

  record(call: GuidanceCallRecord): Promise<void> {
    this.row = call;
    return Promise.resolve();
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const intent = INTENTS.find((candidate) => args.includes(candidate));

  return {
    intent: intent ?? 'explain_finding',
    noEvidence: args.includes('--no-evidence'),
    showRequest: args.includes('--show-request'),
    full: args.includes('--full'),
  };
}

/** Values spliced into the prompt that must never survive redaction. */
const PII_MARKERS = [
  'Jane Doe',
  'Jane',
  'jane.doe@example.com',
  '(555) 123-4567',
  '5551234567',
  '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
];

/**
 * Prints the actual HTTP request the adapter put on the wire.
 *
 * An axios request interceptor rather than a dump of our own payload variable:
 * the question is what the provider received, and only the transport can
 * answer that. If the adapter dropped, reordered or mangled something between
 * the gateway and the socket, this is where it would show.
 */
function attachWireLogger(
  client: AxiosInstance,
  apiKey: string,
  full: boolean,
) {
  client.interceptors.request.use((request) => {
    const body =
      typeof request.data === 'string'
        ? (JSON.parse(request.data) as Record<string, unknown>)
        : (request.data as Record<string, unknown>);
    const serialized = JSON.stringify(body);
    const messages = (body.messages ?? []) as Array<{
      role: string;
      content: string;
    }>;

    console.log('=== HTTP request the model received ===');
    console.log(`POST ${request.url ?? ''}`);
    console.log(
      `api-key: ${apiKey.slice(0, 4)}...(${apiKey.length} chars, masked)`,
    );
    console.log(
      `content-type: ${String(request.headers?.['Content-Type'] ?? '')}`,
    );
    console.log(
      `body: ${serialized.length} bytes, ${messages.length} messages`,
    );
    console.log(`max_completion_tokens: ${String(body.max_completion_tokens)}`);
    console.log(`other body keys: ${Object.keys(body).join(', ')}`);

    for (const message of messages) {
      const head = message.content.slice(0, 400);
      const tail = message.content.slice(-400);
      const elided = message.content.length - 800;
      const shown =
        full || elided <= 0
          ? message.content
          : `${head}\n\n  ...[${elided} more chars — pass --full to see all]...\n\n${tail}`;

      console.log(
        `\n--- role: ${message.role} (${message.content.length} chars) ---`,
      );
      console.log(shown);
    }

    const leaked = PII_MARKERS.filter((marker) => serialized.includes(marker));
    console.log(
      `\nPII scan of the bytes actually sent: ${
        leaked.length === 0 ? 'clean' : `LEAKED -> ${leaked.join(', ')}`
      }`,
    );
    console.log('=== end of request ===\n');

    return request;
  });
}

/**
 * A rough preview of what GN-3 will enforce properly. Not a validator — it
 * exists so a manual run tells you whether the real model actually stayed
 * inside the constraint block, rather than just whether it answered.
 */
function checkConstraints(raw: string, suppliedIds: string[]) {
  let text = raw;
  let citationIds: string[] = [];
  let grounding: Array<{ claim: string; citationIds: string[] }> = [];
  let envelopeShapeValid = false;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      const candidate = parsed as Record<string, unknown>;
      const parsedCitationIds = stringArrayOf(candidate.citationIds);
      const parsedGrounding = groundingOf(candidate.grounding);

      envelopeShapeValid =
        typeof candidate.text === 'string' &&
        parsedCitationIds !== undefined &&
        parsedGrounding !== undefined;
      text = typeof candidate.text === 'string' ? candidate.text : raw;
      citationIds = parsedCitationIds ?? [];
      grounding = parsedGrounding ?? [];
    }
  } catch {
    return [
      {
        label: 'valid JSON envelope',
        pass: false,
        detail: 'response did not parse',
      },
    ];
  }

  const groundedIds = [
    ...new Set(grounding.flatMap((entry) => entry.citationIds)),
  ];
  const visibleCitationIds = [...new Set([...citationIds, ...groundedIds])];
  const invented = visibleCitationIds.filter((id) => !suppliedIds.includes(id));
  const citationSummaryMatches =
    new Set(citationIds).size === citationIds.length &&
    citationIds.length === groundedIds.length &&
    citationIds.every((id) => groundedIds.includes(id));

  return [
    {
      label: 'valid JSON envelope',
      pass: envelopeShapeValid,
      detail: 'text, citationIds and grounding must have the expected types',
    },
    {
      label: 'claim grounding present',
      pass: grounding.length > 0,
      detail: 'grounding must map every response sentence',
    },
    {
      label: 'citation summary matches grounding',
      pass: citationSummaryMatches,
      detail: 'top-level citationIds must equal the grounded union',
    },
    {
      label: 'no dose amount',
      pass: !/\b\d+(\.\d+)?\s?(mg|mcg|ml|g|units?|tablets?|pills?)\b/i.test(
        text,
      ),
      detail: 'digits followed by a unit',
    },
    {
      label: 'no dosing frequency',
      pass: !/\b(once|twice|three times|every)\b[^.]{0,24}\b(a|per|each)?\s?(day|daily|week|hours?|morning|night)\b/i.test(
        text,
      ),
      detail: 'a schedule phrase',
    },
    {
      label: 'no invented citation',
      pass: invented.length === 0,
      detail: invented.join(', '),
    },
    {
      label: 'referral line present',
      pass: /doctor|pharmacist/i.test(text),
      detail: '',
    },
    {
      label: 'no placeholder echoed',
      pass: !/\[(PERSON|EMAIL|PHONE|DATE|ID)_\d+\]/.test(text),
      detail: 'a redaction placeholder was copied into the answer',
    },
    {
      // The template says "no citation ids inside this string" — they belong
      // in citationIds only. Observed being broken by the real model, which is
      // exactly why this is a validator rule and not a trust exercise.
      label: 'no citation id inside text',
      pass: !suppliedIds.some((id) => text.includes(id)),
      detail: 'the model wrote citation ids into the patient-facing prose',
    },
  ];
}

function stringArrayOf(value: unknown): string[] | undefined {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string')
  ) {
    return undefined;
  }
  return value;
}

function groundingOf(
  value: unknown,
): Array<{ claim: string; citationIds: string[] }> | undefined {
  if (!Array.isArray(value)) return undefined;

  const grounding: Array<{ claim: string; citationIds: string[] }> = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return undefined;
    const candidate = entry as Record<string, unknown>;
    const citationIds = stringArrayOf(candidate.citationIds);
    if (typeof candidate.claim !== 'string' || citationIds === undefined) {
      return undefined;
    }
    grounding.push({ claim: candidate.claim, citationIds });
  }

  return grounding;
}

async function main() {
  // The gateway debug-logs the whole redacted prompt, which is right in the
  // app and unreadable here.
  Logger.overrideLogger(['warn', 'error']);

  const config = new GenerationConfig(new ConfigService());
  const { intent, noEvidence, showRequest, full } = parseArgs();

  if (config.providerName !== 'foundry') {
    console.error(
      'GENERATION_PROVIDER is not "foundry" — nothing to check.\n' +
        'This script exists to verify the real provider. Set it in moeen/.env first.',
    );
    process.exit(1);
  }

  console.log('This makes a real, billed call to Foundry.\n');
  console.log(
    `intent     : ${intent}${noEvidence ? ' (no-evidence variant)' : ''}`,
  );
  console.log(`deployment : ${config.foundryDeployment}`);
  console.log(
    `timeout    : ${config.timeoutMs}ms, up to ${config.maxAttempts} attempt(s)\n`,
  );

  const assembled = new PromptAssembler(
    new TemplateLoader(),
    new TemplateRenderer(),
    new ScopeFormatter(),
    new ChunkFormatter(),
  ).assemble({
    intent,
    scope: patientScopeFixtures.interactionCase,
    retrieval: noEvidence
      ? retrievalResultFixtures.noEvidence
      : retrievalResultFixtures.found,
    severity: 'moderate',
    subjectMedicationName: 'warfarin',
    question:
      intent === 'medication_question'
        ? 'Why were these two flagged together?'
        : undefined,
  });

  // Real identifiers spliced in, so a run also proves redaction is happening
  // at the boundary rather than being assumed.
  const payload = {
    systemPrompt: assembled.systemPrompt,
    userPrompt:
      `${assembled.userPrompt}\n\nPatient contact on file: Jane Doe, ` +
      `jane.doe@example.com, (555) 123-4567, ref 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d.`,
  };

  const recorder = new PrintingRecorder();
  const client = axios.create();
  if (showRequest) attachWireLogger(client, config.foundryApiKey, full);

  const provider =
    config.providerName === 'foundry'
      ? new FoundryLlmProvider(new HttpService(client), config)
      : new StubLlmProvider(config);

  const gateway = new ProviderGateway(
    new Redactor(),
    new RedactionMetrics(),
    config,
    new CircuitBreaker(config),
    new GuidanceRateLimiter(config),
    new LlmCallExecutor(provider, config),
    recorder,
  );

  const result = await gateway.dispatch(
    payload,
    { fullName: 'Jane Doe', firstName: 'Jane', lastName: 'Doe' },
    { patientId: 1, intent },
  );

  console.log(`prompt version : ${assembled.promptVersion}`);
  console.log(
    `citations sent : ${assembled.suppliedCitationIds.join(', ') || '(none)'}`,
  );
  console.log(`redactions     : ${result.redactionCount}`);
  console.log(`outcome        : ${result.outcome}`);

  if (result.outcome !== 'generated') {
    console.log(`failure        : ${JSON.stringify(result.failure)}`);
    console.log(
      '\nThe gateway returned a fallback instead of throwing, which is correct.',
    );
    console.log('GN-3 turns this into deterministic patient text.');
    process.exit(1);
  }

  console.log(
    `usage          : in=${result.usage?.promptTokens} out=${result.usage?.completionTokens}`,
  );
  console.log(`latency        : ${recorder.row?.latencyMs}ms`);

  console.log('\n--- model output ---');
  console.log(result.text);

  console.log(
    '\n--- constraint check (a preview of GN-3, not a substitute) ---',
  );
  const checks = checkConstraints(result.text, assembled.suppliedCitationIds);
  for (const check of checks) {
    const mark = check.pass ? 'PASS' : 'FAIL';
    console.log(
      `  ${mark}  ${check.label}${check.pass || !check.detail ? '' : ` — ${check.detail}`}`,
    );
  }

  const failed = checks.filter((check) => !check.pass);
  console.log(
    failed.length === 0
      ? '\nThe real model stayed inside the constraint block.'
      : `\n${failed.length} constraint(s) broken — worth showing the team.`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

void main();
