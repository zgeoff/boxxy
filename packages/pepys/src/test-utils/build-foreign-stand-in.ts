import {
  defineConsumer,
  defineFactFamily,
  definePlugin,
  defineSource,
  defineTable,
} from '@pepys/kit';
import { z } from 'zod';
import type { DeliveryReadRow, DeliverySelectOptions, ForeignReads } from '../queries/types.ts';

// No fact reaches a stand-in consumer: a test writes its rows. Its entry is this file, which
// exports no `applyFact`, so a fact sent to one fails the apply.
const entry = new URL(import.meta.url);

const logRecordFamily = defineFactFamily({
  stream: 'facts.telemetry.log_record',
  api: 'otlp-logs/1',
  entityKind: 'telemetry:session',
  types: {},
});

const pullRequestFamily = defineFactFamily({
  stream: 'facts.github.pull_request',
  api: 'github-webhook/1',
  entityKind: 'github:pull_request',
  types: {},
});

const telemetryColumns = {
  id: { kind: 'entityID' },
  session_id: { kind: 'entityID' },
  origin_issuer: { kind: 'text' },
  origin_subject: { kind: 'text' },
  product: { kind: 'text' },
  at: { kind: 'timestamp' },
} as const;

const telemetryModelRequestConsumer = defineConsumer({
  name: 'telemetry_model_request',
  entry,
  input: { mode: 'fact', streams: [logRecordFamily.stream] },
  tables: {
    telemetry_model_request: defineTable({
      columns: {
        ...telemetryColumns,
        model: { kind: 'text' },
        cost_basis: { kind: 'text' },
        cost_usd: { kind: 'real', nullable: true },
        input_tokens: { kind: 'integer' },
        cache_read_tokens: { kind: 'integer' },
        cache_creation_tokens: { kind: 'integer' },
        output_tokens: { kind: 'integer' },
      },
      primaryKey: ['id'],
      indexes: [{ columns: ['session_id'] }],
    }),
  },
  entityViews: [],
  reads: [],
  links: [],
});

const telemetryTurnCostConsumer = defineConsumer({
  name: 'telemetry_turn_cost',
  entry,
  input: { mode: 'fact', streams: [logRecordFamily.stream] },
  tables: {
    telemetry_turn_cost: defineTable({
      columns: {
        ...telemetryColumns,
        model: { kind: 'text', nullable: true },
        cost_usd: { kind: 'real' },
      },
      primaryKey: ['id'],
      indexes: [{ columns: ['session_id'] }],
    }),
  },
  entityViews: [],
  reads: [],
  links: [],
});

const githubPullRequestConsumer = defineConsumer({
  name: 'github_pull_request',
  entry,
  input: { mode: 'fact', streams: [pullRequestFamily.stream] },
  tables: {
    github_pull_request: defineTable({
      columns: {
        id: { kind: 'entityID' },
        merged_at: { kind: 'timestamp', nullable: true },
      },
      primaryKey: ['id'],
      indexes: [],
    }),
  },
  entityViews: [],
  reads: ['github_pull_request'],
  links: [],
});

const atSchema = z.object({ at: z.string() }).nullable();

const deliveryRowsSchema = z.array(
  z.object({
    pullRequest: z.string(),
    mergedAt: z.string().nullable(),
    release: atSchema,
    deploy: atSchema,
  }),
);

// The telemetry and GitHub plug-ins as far as the queries read them: the three consumers with the
// columns the queries name, and the GitHub delivery module as rows the test sets per pull request.
// Each select it receives is kept, in order.
export function buildForeignStandIn() {
  const deliveries = new Map<string, DeliveryReadRow>();

  const selects: DeliverySelectOptions[] = [];

  const foreign: ForeignReads = {
    telemetryModelRequest: telemetryModelRequestConsumer,
    telemetryTurnCost: telemetryTurnCostConsumer,
    githubPullRequest: githubPullRequestConsumer,
    delivery: {
      consumers: [githubPullRequestConsumer],
      select: (options) => {
        selects.push(options);

        const rows = options.pullRequests.flatMap((id) => deliveries.get(id) ?? []);
        const readRows = () => Promise.resolve({ rows });

        return { execute: readRows };
      },
      parse: (rows) => deliveryRowsSchema.parse(rows),
    },
  };

  return {
    foreign,
    plugins: [
      definePlugin({
        name: 'telemetry',
        sources: [defineSource({ name: 'telemetry', families: [logRecordFamily] })],
        consumers: [telemetryModelRequestConsumer, telemetryTurnCostConsumer],
      }),
      definePlugin({
        name: 'github',
        sources: [defineSource({ name: 'github', families: [pullRequestFamily] })],
        consumers: [githubPullRequestConsumer],
      }),
    ],
    consumers: {
      telemetryModelRequest: telemetryModelRequestConsumer,
      telemetryTurnCost: telemetryTurnCostConsumer,
      githubPullRequest: githubPullRequestConsumer,
    },
    selects,
    setDeliveries: (rows: readonly DeliveryReadRow[]) => {
      for (const row of rows) {
        deliveries.set(row.pullRequest, row);
      }
    },
  };
}
