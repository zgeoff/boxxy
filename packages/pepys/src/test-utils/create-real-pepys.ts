import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { buildQueryContext, createApp } from '@pepys/api';
import { createFakeSenderProof, createIngest, createMemoryFactLog } from '@pepys/ingest';
import { checkDeployment, toStreamName } from '@pepys/kit';
import type { Sender } from '@pepys/kit';
import { githubDelivery, githubPlugin, githubPullRequestConsumer } from '@pepys/source-github';
import {
  telemetryModelRequestConsumer,
  telemetryPlugin,
  telemetryTurnCostConsumer,
} from '@pepys/source-telemetry';
import { applyFactLog, createTestStore } from '@pepys/testing';
import { buildBoxxyPlugin } from '../build-boxxy-plugin.ts';
import type { ForeignReads } from '../queries/types.ts';
import type { UncheckedQueryClient } from '../types.ts';
import type { TelemetryRequest, TestPepys, TestPepysOptions } from './create-test-pepys.ts';

const foreign: ForeignReads = {
  telemetryModelRequest: telemetryModelRequestConsumer,
  telemetryTurnCost: telemetryTurnCostConsumer,
  githubPullRequest: githubPullRequestConsumer,
  delivery: githubDelivery,
};

const telemetryToken = 'telemetry-test-token';

// The real pepys ingest, plug-ins and query API, in process. Ingest appends to its memory fact log;
// before each query, `applyFactLog` does the host's part and applies what is new to the kit's test
// store, which the API reads.
export async function createRealPepys(options: TestPepysOptions): Promise<TestPepys> {
  const plugins = [buildBoxxyPlugin(foreign), githubPlugin, telemetryPlugin];
  const checked = checkDeployment({ name: 'boxxy-system-test', plugins });

  if (!checked.ok) {
    throw new Error(`the deployment does not check: ${JSON.stringify(checked.failure)}`);
  }

  const deployment = checked.value;

  const streams = deployment.sources.flatMap((source) =>
    source.families.map((family) => toStreamName(family.stream)),
  );

  const log = createMemoryFactLog(streams);
  const senders: Record<string, Sender> = {};

  const ingest = createIngest({
    deployment,
    secrets: {
      PEPYS_BOXXY_SIGNING_SECRET: options.boxxySecret,
      PEPYS_GITHUB_WEBHOOK_SECRET: options.webhookSecret,
      PEPYS_TELEMETRY_TOKEN: telemetryToken,
      PEPYS_GITHUB_APP_ID: '1',
      PEPYS_GITHUB_APP_PRIVATE_KEY: 'unused',
    },
    log,
    senderProof: createFakeSenderProof(senders),
    appendRetry: { maxAttempts: 1, retryDelayMs: 0 },
    now: () => Date.now(),
  });

  const store = await createTestStore({ plugins });

  const applyLog = () => applyFactLog(store, log, deployment);

  // The client sees only a generic 500, so the server's own error goes to the test output.
  const app = createApp(buildQueryContext(store.reader, deployment), {
    logError: (message, error) => {
      console.error(message, error);
    },
    oauth: null,
  });

  const sendRequest = (url: string, init: RequestInit) => app.handle(new Request(url, init));

  const api = createORPCClient<UncheckedQueryClient>(
    new RPCLink({ origin: 'http://pepys.test', url: '/rpc', fetch: sendRequest }),
  );

  return {
    handleRequest: (request) => ingest.handleRequest(request),
    client: {
      boxxy_cost_to_land: async (input) => {
        await applyLog();

        return api.boxxy_cost_to_land(input);
      },
      boxxy_stage_time: async (input) => {
        await applyLog();

        return api.boxxy_stage_time(input);
      },
    },
    writeTelemetry: async (requests) => {
      for (const request of requests) {
        const token = `token-${request.origin.issuer}-${request.origin.subject}`;

        senders[token] = { ...request.origin, name: request.origin.subject };

        const body = JSON.stringify(buildOTLPLogs(request));

        const answer = await ingest.handleRequest(
          new Request('http://pepys.test/v1/logs', {
            method: 'POST',
            headers: {
              authorization: `Bearer ${telemetryToken}`,
              'imp-identity': token,
              'content-type': 'application/json',
            },
            body,
          }),
        );

        if (answer.status !== 200) {
          throw new Error(`telemetry answered ${answer.status}: ${await answer.text()}`);
        }
      }
    },
    [Symbol.asyncDispose]: () => store[Symbol.asyncDispose](),
  };
}

// One Claude Code `api_request` log record in an OTLP logs body, as the telemetry route reads it.
function buildOTLPLogs(request: TelemetryRequest) {
  const nanos = `${Date.parse(request.at)}000000`;

  const record = {
    timeUnixNano: nanos,
    observedTimeUnixNano: nanos,
    body: { stringValue: 'event' },
    attributes: buildOTLPAttributes({
      'event.name': 'api_request',
      'session.id': `agent-of-${request.session}`,
      'event.timestamp': request.at,
      request_id: request.id,
      model: request.model,
      cost_usd: request.costUSD,
      input_tokens: request.inputTokens,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      output_tokens: request.outputTokens,
      duration_ms: 1000,
    }),
  };

  const scope = { scope: { name: 'com.anthropic.claude_code.events' }, logRecords: [record] };
  const resource = { attributes: buildOTLPAttributes({ 'atc.session.id': request.session }) };

  return { resourceLogs: [{ resource, scopeLogs: [scope] }] };
}

function buildOTLPAttributes(values: Record<string, string | number>) {
  return Object.entries(values).map(([key, value]) => ({ key, value: toOTLPValue(key, value) }));
}

// OTLP sends an integer as text; the cost is a double even when it is whole.
function toOTLPValue(key: string, value: string | number) {
  if (typeof value === 'string') {
    return { stringValue: value };
  }

  return Number.isInteger(value) && key !== 'cost_usd'
    ? { intValue: String(value) }
    : { doubleValue: value };
}
