import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { buildQueryContext, createApp } from '@pepys/api';
import { createFakeSenderProof, createIngest, createMemoryFactLog } from '@pepys/ingest';
import { checkDeployment, parseStreamName } from '@pepys/kit';
import type {
  FactBatchBody,
  FactEnvelope,
  Sender,
  SourceDefinition,
  StreamName,
  StreamOffset,
} from '@pepys/kit';
import {
  githubDeliveryConsumers,
  githubPlugin,
  githubPullRequestConsumer,
  parsePullRequestDeliveries,
  selectPullRequestDelivery,
} from '@pepys/source-github';
import {
  telemetryModelRequestConsumer,
  telemetryPlugin,
  telemetryTurnCostConsumer,
} from '@pepys/source-telemetry';
import { createTestStore } from '@pepys/testing';
import type { AppliedFact } from '@pepys/testing';
import { buildBoxxyPlugin } from '../build-boxxy-plugin.ts';
import type { DeliveryReads, ForeignReads } from '../queries/types.ts';
import type { UncheckedQueryClient } from '../types.ts';
import type { TelemetryRequest, TestPepys, TestPepysOptions } from './create-test-pepys.ts';

// The pull requests that the item's attempts produced, as boxxy's own rows give them, and then
// the GitHub plug-in's delivery module on those pull requests.
const delivery: DeliveryReads = {
  consumers: [...githubDeliveryConsumers],
  readDeliveries: async (db, input) => {
    const produced = await db
      .selectFrom('link_effective as produced')
      .innerJoin('boxxy_attempt as attempt', 'attempt.id', 'produced.from_id')
      .where('produced.type', '=', 'produced')
      .where('attempt.item_id', '=', input.item)
      .select('produced.to_id as id')
      .distinct()
      .execute();

    const [first, ...rest] = produced.map((row) => row.id);

    if (first === undefined) {
      return [];
    }

    const result = await selectPullRequestDelivery({
      pullRequests: [first, ...rest],
      environment: input.environment,
    }).execute(db);

    return parsePullRequestDeliveries(result.rows).map((row) => ({
      pullRequest: row.pullRequest,
      mergedAt: row.mergedAt,
      release: row.release === null ? null : { at: row.release.at },
      deploy: row.deploy === null ? null : { at: row.deploy.at },
    }));
  },
};

const foreign: ForeignReads = {
  telemetryModelRequest: telemetryModelRequestConsumer,
  telemetryTurnCost: telemetryTurnCostConsumer,
  githubPullRequest: githubPullRequestConsumer,
  delivery,
};

const telemetryToken = 'telemetry-test-token';

// The real pepys ingest, the GitHub, telemetry and boxxy plug-ins, and the real query API, in
// process. Ingest appends to its memory fact log. A host applies the log to the store; here each
// query first applies what is new to the kit's test store, which the API then reads.
export async function createRealPepys(options: TestPepysOptions): Promise<TestPepys> {
  const plugins = [buildBoxxyPlugin(foreign), githubPlugin, telemetryPlugin];
  const checked = checkDeployment({ name: 'boxxy-system-test', plugins });

  if (!checked.ok) {
    throw new Error(`the deployment does not check: ${JSON.stringify(checked.failure)}`);
  }

  const deployment = checked.value;

  const streams = deployment.sources
    .flatMap((source) => source.families.map((family) => family.stream))
    .filter((stream) => isStreamName(stream));

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

  const applied = new Map<StreamName, StreamOffset>();

  for (const stream of streams) {
    const tail = await log.readTail(stream);

    if (tail.ok) {
      applied.set(stream, tail.value);
    }
  }

  const applyLog = async () => {
    for (const source of deployment.sources) {
      for (const stream of source.families.map((family) => family.stream)) {
        await applyStream(source, stream);
      }
    }
  };

  const applyStream = async (source: SourceDefinition, name: string) => {
    const from = isStreamName(name) ? applied.get(name) : undefined;

    if (!isStreamName(name) || from === undefined) {
      throw new Error(`the log holds no stream ${name}`);
    }

    const tail = await log.readTail(name);

    const read = tail.ok ? await log.read(name, from, tail.value - from) : tail;

    if (!tail.ok || !read.ok) {
      throw new Error(`the log refused a read of ${name}`);
    }

    const facts = read.value
      .map((stored) => toOutgoingFact(source.name, stored.fact))
      .filter((fact) => isAppliedFact(source, fact));

    if (facts.length !== read.value.length) {
      throw new Error(`the log holds a fact of ${name} that the source's families refuse`);
    }

    if (facts.length > 0) {
      await store.apply(source, facts);
    }

    applied.set(name, tail.value);
  };

  const app = createApp(buildQueryContext(store.reader, deployment));
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

// The kit tags a stream name it has parsed; a declared family stream always parses.
function isStreamName(name: string): name is StreamName {
  return parseStreamName(name).ok;
}

type WireFact = FactBatchBody['facts'][number];

// The fact of a batch that ingest built the envelope from; the event is the envelope's ID less
// the source's prefix.
function toOutgoingFact(sourceName: string, fact: FactEnvelope<unknown>): WireFact {
  return {
    type: fact.type,
    event: fact.id.replace(`event:${sourceName}:`, ''),
    entity: fact.entity,
    ...(fact.actor === undefined ? {} : { actor: fact.actor }),
    at: fact.at,
    payload: fact.payload,
  };
}

// The check that ingest made before it stored the fact: a type of one of the source's families,
// with a payload that the type's schema accepts.
function isAppliedFact(
  source: SourceDefinition,
  fact: WireFact,
): fact is WireFact & AppliedFact<SourceDefinition> {
  return source.families.some(
    (family) =>
      Object.hasOwn(family.types, fact.type) &&
      family.types[fact.type]?.safeParse(fact.payload).success === true,
  );
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
