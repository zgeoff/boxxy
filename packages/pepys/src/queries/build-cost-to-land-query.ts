import { costToLandSchema } from '@boxxy/model';
import { defineQuery } from '@pepys/kit';
import type { EntityID, QueryCall } from '@pepys/kit';
import { z } from 'zod';
import { boxxyWorkConsumer } from '../work/boxxy-work-consumer.ts';
import { buildCostToLand } from './build-cost-to-land.ts';
import { findItemEntityID } from './find-item-entity-id.ts';
import type {
  ForeignReads,
  GithubPullRequestConsumer,
  TelemetryModelRequestConsumer,
  TelemetryTurnCostConsumer,
} from './types.ts';

// The cost query over the boxxy consumer and the telemetry and GitHub consumers. Each statement
// reads plain rows, and the builder does the caller match, the windows and the sums.
export function buildCostToLandQuery(foreign: ForeignReads) {
  return defineQuery({
    name: 'boxxy_cost_to_land',
    description:
      'Returns what one boxxy item cost to land: the model requests, tokens and cost of every attempt at the item, per phase, product and model, with rework apart. `landedAt` is null until a pull request of the item merges.',
    input: z.object({ item: z.string().describe('The item, as `boxxy:item:<id>`') }),
    output: costToLandSchema,
    reads: [
      boxxyWorkConsumer,
      foreign.telemetryModelRequest,
      foreign.telemetryTurnCost,
      foreign.githubPullRequest,
    ],
    handler: async (call) => {
      const item = findItemEntityID(call.input.item);

      if (item === undefined) {
        return buildCostToLand({
          item: call.input.item,
          attempts: [],
          bindings: [],
          requests: [],
          turns: [],
          pullRequests: [],
        });
      }

      return buildCostToLand({ item: call.input.item, ...(await readCostRows(call.db, item)) });
    },
  });
}

type CostDB = QueryCall<
  unknown,
  readonly [
    typeof boxxyWorkConsumer,
    TelemetryModelRequestConsumer,
    TelemetryTurnCostConsumer,
    GithubPullRequestConsumer,
  ]
>['db'];

async function readCostRows(db: CostDB, item: EntityID) {
  const sessions = db
    .selectFrom('boxxy_attempt_session as own')
    .innerJoin('boxxy_attempt as attempt', 'attempt.id', 'own.attempt_id')
    .where('attempt.item_id', '=', item)
    .select('own.session_id');

  const attempts = await db
    .selectFrom('boxxy_attempt')
    .where('item_id', '=', item)
    .select([
      'id',
      'phase',
      'number',
      'round',
      'state',
      'outcome',
      'failure',
      'claimed_at',
      'ended_at',
      'sleeps',
    ])
    .orderBy('number')
    .orderBy('id')
    .execute();

  const bindings = await db
    .selectFrom('boxxy_attempt_session')
    .where('session_id', 'in', sessions)
    .select(['attempt_id', 'session_id', 'bound_at', 'caller_issuer', 'caller_subject'])
    .execute();

  const requests = await db
    .selectFrom('telemetry_model_request')
    .where('session_id', 'in', sessions)
    .select([
      'session_id',
      'origin_issuer',
      'origin_subject',
      'product',
      'model',
      'cost_basis',
      'cost_usd',
      'input_tokens',
      'cache_read_tokens',
      'cache_creation_tokens',
      'output_tokens',
      'at',
    ])
    .execute();

  const turns = await db
    .selectFrom('telemetry_turn_cost')
    .where('session_id', 'in', sessions)
    .select(['session_id', 'origin_issuer', 'origin_subject', 'product', 'model', 'cost_usd', 'at'])
    .execute();

  const pullRequests = await db
    .selectFrom('link_effective as produced')
    .innerJoin('boxxy_attempt as attempt', 'attempt.id', 'produced.from_id')
    .leftJoin('github_pull_request as pull_request', 'pull_request.id', 'produced.to_id')
    .where('produced.type', '=', 'produced')
    .where('attempt.item_id', '=', item)
    .select(['produced.to_id as id', 'pull_request.merged_at'])
    .distinct()
    .execute();

  return { attempts, bindings, requests, turns, pullRequests };
}
