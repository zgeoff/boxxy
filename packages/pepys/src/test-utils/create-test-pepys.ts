import { isDeliveryAuthentic } from '@pepys/kit';
import type { DeliveryCheck, FactEnvelope } from '@pepys/kit';
import { createTestStore } from '@pepys/testing';
import { z } from 'zod';
import { boxxySource } from '../boxxy-source.ts';
import { buildBoxxyPlugin } from '../build-boxxy-plugin.ts';
import { buildCostToLandQuery } from '../queries/build-cost-to-land-query.ts';
import { buildStageTimeQuery } from '../queries/build-stage-time-query.ts';
import type { DeliveryReads, ForeignReads } from '../queries/types.ts';
import { isOutgoingFact } from '../sink/is-outgoing-fact.ts';
import type { UncheckedQueryClient } from '../types.ts';
import { buildForeignStandIn } from './build-foreign-stand-in.ts';
import { toEntityID } from './to-entity-id.ts';

export interface TestPepysOptions {
  // the value of `PEPYS_BOXXY_SIGNING_SECRET`, which the fact batch route checks
  readonly boxxySecret: string;

  // the value of `PEPYS_GITHUB_WEBHOOK_SECRET`, which the webhook route checks
  readonly webhookSecret: string;
}

// One model request of an agent session, with the proven sender of its record.
export interface TelemetryRequest {
  readonly id: string;

  // the atc session ID that the agent copies onto its records
  readonly session: string;
  readonly origin: { readonly issuer: string; readonly subject: string };
  readonly model: string;
  readonly costUSD: number;
  readonly inputTokens: number;
  readonly outputTokens: number;

  // ISO 8601
  readonly at: string;
}

export interface TestPepys extends AsyncDisposable {
  // ingest's two routes that boxxy's journey reaches: the boxxy fact batch route and the GitHub
  // webhook route; any other path answers 404
  readonly handleRequest: (request: Request) => Promise<Response>;

  // the two queries of the boxxy plug-in, as the pepys API answers them
  readonly client: UncheckedQueryClient;

  // the rows that the telemetry route would write for these records
  readonly writeTelemetry: (requests: readonly TelemetryRequest[]) => Promise<void>;
}

const webhookRoute = '/webhook/github';

const webhookCheck: DeliveryCheck = {
  kind: 'hmac-sha256',
  header: 'x-hub-signature-256',
  secretEnv: 'PEPYS_GITHUB_WEBHOOK_SECRET',
};

// GitHub's `pull_request` event, as far as the merge time goes
const pullRequestEventSchema = z.object({
  action: z.string(),
  pull_request: z.object({ id: z.number().int(), merged_at: z.string().nullable() }),
});

// The boxxy plug-in on the kit's test store, behind the kit's own signature check and batch read.
// The GitHub and telemetry plug-ins are stand-ins: the webhook writes the pull request row, and
// the delivery read knows merges only, no release and no deploy.
export async function createTestPepys(options: TestPepysOptions): Promise<TestPepys> {
  const standIn = buildForeignStandIn();

  const merges = new Map<string, string | null>();

  const foreign: ForeignReads = { ...standIn.foreign, delivery: buildDeliveryReads(merges) };
  const plugin = buildBoxxyPlugin(foreign);

  const store = await createTestStore({ plugins: [plugin, ...standIn.plugins] });

  const costQuery = buildCostToLandQuery(foreign);
  const stageQuery = buildStageTimeQuery(foreign.delivery);
  const path = boxxySource.live;

  if (path?.kind !== 'receive') {
    throw new Error('the boxxy source has no receive path');
  }

  const stored = new Set<string>();

  const receiveFacts = async (request: Request): Promise<Response> => {
    const buffer = await request.arrayBuffer();

    const body = new Uint8Array(buffer);

    if (!isDeliveryAuthentic(path.check, options.boxxySecret, request.headers, body)) {
      return Response.json({ error: 'the signature does not match' }, { status: 401 });
    }

    const received = path.read(
      { headers: request.headers, body },
      { name: boxxySource.name, families: boxxySource.families },
    );

    if (received.kind === 'refused') {
      return Response.json({ error: received.reason }, { status: received.status });
    }

    if (received.kind === 'ignored') {
      return Response.json({ status: 'ignored' }, { status: 202 });
    }

    const facts = received.batch.facts
      .filter((pending) => !stored.has(pending.fact.id))
      .map((pending) => toOutgoingFact(pending.fact))
      .filter((fact) => isOutgoingFact(fact));

    await store.apply(boxxySource, facts);

    for (const pending of received.batch.facts) {
      stored.add(pending.fact.id);
    }

    return Response.json({ status: 'stored', stored: received.batch.facts.length });
  };

  const receiveWebhook = async (request: Request): Promise<Response> => {
    const buffer = await request.arrayBuffer();

    const body = new Uint8Array(buffer);

    if (!isDeliveryAuthentic(webhookCheck, options.webhookSecret, request.headers, body)) {
      return Response.json({ error: 'the signature does not match' }, { status: 401 });
    }

    const raw: unknown = JSON.parse(new TextDecoder().decode(body));
    const event = pullRequestEventSchema.safeParse(raw);

    if (request.headers.get('x-github-event') !== 'pull_request' || !event.success) {
      return Response.json({ status: 'ignored' }, { status: 202 });
    }

    const id = `github:pull_request:${event.data.pull_request.id}`;

    merges.set(id, event.data.pull_request.merged_at);

    await store.writeRows(standIn.consumers.githubPullRequest, 'github_pull_request', [
      { id: toEntityID(id), merged_at: event.data.pull_request.merged_at },
    ]);

    return Response.json({ status: 'stored', stored: 1 });
  };

  return {
    handleRequest: (request) => {
      const route = new URL(request.url).pathname;

      if (route === path.route) {
        return receiveFacts(request);
      }

      return route === webhookRoute
        ? receiveWebhook(request)
        : Promise.resolve(Response.json({ error: 'no such route' }, { status: 404 }));
    },
    client: {
      boxxy_cost_to_land: (input) => store.query(costQuery, input),
      boxxy_stage_time: (input) => store.query(stageQuery, input),
    },
    writeTelemetry: (requests) =>
      store.writeRows(
        standIn.consumers.telemetryModelRequest,
        'telemetry_model_request',
        requests.map((request) => ({
          id: toEntityID(`telemetry:model_request:${request.id}`),
          session_id: toEntityID(`telemetry:session:${request.session}`),
          origin_issuer: request.origin.issuer,
          origin_subject: request.origin.subject,
          product: 'claude_code',
          model: request.model,
          cost_basis: 'reported',
          cost_usd: request.costUSD,
          input_tokens: request.inputTokens,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
          output_tokens: request.outputTokens,
          at: request.at,
        })),
      ),
    [Symbol.asyncDispose]: () => store[Symbol.asyncDispose](),
  };
}

// The merge of each pull request that an attempt of the item produced, read through the
// `produced` links as the GitHub plug-in's delivery module reads it.
function buildDeliveryReads(merges: ReadonlyMap<string, string | null>): DeliveryReads {
  return {
    consumers: [],
    readDeliveries: async (db, input) => {
      const produced = await db
        .selectFrom('link_effective as produced')
        .innerJoin('boxxy_attempt as attempt', 'attempt.id', 'produced.from_id')
        .where('produced.type', '=', 'produced')
        .where('attempt.item_id', '=', input.item)
        .select('produced.to_id as id')
        .distinct()
        .orderBy('produced.to_id')
        .execute();

      return produced.map((row) => ({
        pullRequest: row.id,
        mergedAt: merges.get(row.id) ?? null,
        release: null,
        deploy: null,
      }));
    },
  };
}

// The fact of a batch that ingest built the envelope from; the event is the envelope's ID less
// the source's prefix.
function toOutgoingFact(fact: FactEnvelope<unknown>) {
  return {
    type: fact.type,
    event: fact.id.replace(`event:${boxxySource.name}:`, ''),
    entity: fact.entity,
    ...(fact.actor === undefined ? {} : { actor: fact.actor }),
    at: fact.at,
    payload: fact.payload,
  };
}
