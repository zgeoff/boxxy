// boxxy pepys package, file 2 of 4: the two queries. Not compiled or type-checked.
//
//   A. The call sites.
//   B. The two output schemas, declared once        boxxy repo, libs/model/src/reports/
//   C. `boxxy_cost_to_land`                         packages/pepys/src/boxxy-cost-to-land-query.ts
//   D. `boxxy_stage_time`                           packages/pepys/src/boxxy-stage-time-query.ts
//
// Built (slice 18): each query reads plain rows, one statement per table, through `call.db`, in
// `queries/build-cost-to-land-query.ts` and `queries/build-stage-time-query.ts`. A pure builder
// (`queries/build-cost-to-land.ts`, `queries/build-stage-time.ts`) does the stretches, the caller
// match, the sums and the time compares with `Date.parse`. The store runs no `julianday`, no
// window function and no common table expression. The stage-time query reads the item's pull
// requests through the `produced` links, then calls the `select` and `parse` of the delivery
// module that the deployment passes (`DeliveryReads` in `queries/types.ts`); it calls no select for
// an item with no pull request. A review that settled
// `unsettleable` starts no merge step.

import { defineQuery } from '@pepys/kit';
import type { QueryCall } from '@pepys/kit';
import { githubDeliveryConsumers, githubPullRequestConsumer, selectPullRequestDelivery } from '@pepys/source-github';
import { telemetryModelRequestConsumer, telemetryTurnCostConsumer } from '@pepys/source-telemetry';
import { sql } from 'kysely';
import type { Expression, SqlBool } from 'kysely';
import { z } from 'zod';
import { boxxyWorkConsumer } from './01-package.ts';

// ── A. The call sites ──────────────────────────────────────────────────────────────────────────

// The pepys API serves each query at /rpc and as an MCP tool of the same name. boxxy calls both
// through its reader (03-readers.ts). An ID in an input is a pepys entity ID.
declare const client: { boxxy_cost_to_land: (input: { item: string }) => Promise<CostToLand>; boxxy_stage_time: (input: { item: string; environment: string }) => Promise<StageTime> };

const cost = await client.boxxy_cost_to_land({ item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001' });
// { item: 'boxxy:item:0193…0001', landedAt: '2026-11-11T06:00:00Z', attempts: 4,
//   lines: [
//     { phase: 'build',  rework: false, product: 'claude_code', model: 'model-large', requests: 41, inputTokens: 900, cacheReadTokens: 61000, cacheCreationTokens: 4000, outputTokens: 12000, costUSD: 3.1,  costBasis: 'reported' },
//     { phase: 'build',  rework: true,  product: 'claude_code', model: 'model-large', requests: 12, …,                                                                                        costUSD: 0.9,  costBasis: 'reported' },
//     { phase: 'review', rework: false, product: 'codex',       model: 'model-small', requests: 9,  …,                                                                                        costUSD: null, costBasis: 'none' },
//     { phase: 'review', rework: false, product: 'codex',       model: 'model-small', requests: 0,  …,                                                                                        costUSD: 0.2,  costBasis: 'turn' },
//   ],
//   totals: { requests: 62, costUSD: 4.2, reworkCostUSD: 0.9, requestsWithoutCost: 0 } }

const times = await client.boxxy_stage_time({ item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001', environment: 'production' });
// { item: …, environment: 'production',
//   steps: [ { step: 'triage', minutes: 4,   endedAt: '2026-11-11T02:04:00.000Z' }, { step: 'design', … }, { step: 'build', … },
//            { step: 'review', minutes: 21,  endedAt: '2026-11-11T05:40:00.000Z' },
//            { step: 'merge',  minutes: 20,  endedAt: '2026-11-11T06:00:00Z' },
//            { step: 'release', minutes: 55, endedAt: '2026-11-11T06:55:00Z' },
//            { step: 'deploy', minutes: null, endedAt: null } ],
//   rework: { count: 1, minutes: 38 }, reviewWaitMinutes: 6, sleepMinutes: 0,
//   pullRequests: ['github:pull_request:9001'] }

void [cost, times];

// ── B. boxxy repo, libs/model/src/reports/ ────────────────────────────────────────────
//
// The build adds this file. Declared once, in `@boxxy/model`, for the reason the fact schemas
// are: the reader port in `@boxxy/model` and the report procedures in `@boxxy/contract` name
// these types, and neither may import `@boxxy/pepys`. The query uses them as its `output`; the contract adds `behind`.
// Plain zod objects with no transform, as the kit asks of a query's output.

export const phaseSteps = ['triage', 'design', 'build', 'review'] as const;
export const stageSteps = [...phaseSteps, 'merge', 'release', 'deploy'] as const;

// How a line's cost is known. 'reported' and 'none' are the values of
// `telemetry_model_request.cost_basis`. 'turn' is this query's own: the line is a sum of
// `telemetry_turn_cost` rows.
export const costBases = ['reported', 'turn', 'none'] as const;

export const costToLandSchema = z.object({
  item: z.string(),
  // The earliest `merged_at` of a pull request that an attempt of the item produced. null: the
  // item has not landed, and the lines are its cost so far.
  landedAt: z.string().nullable(),
  attempts: z.number().int(),
  lines: z.array(
    z.object({
      phase: z.string(),
      rework: z.boolean(), // the attempt's round is above 1
      product: z.string(),
      // A 'turn' line has the model of `telemetry_turn_cost.model`. null only on a 'turn' line
      // whose record carried no model.
      model: z.string().nullable(),
      requests: z.number().int(),
      inputTokens: z.number().int(),
      cacheReadTokens: z.number().int(),
      cacheCreationTokens: z.number().int(),
      outputTokens: z.number().int(),
      costUSD: z.number().nullable(), // null: not known. Never 0 for "not known"
      costBasis: z.enum(costBases),
    }),
  ),
  totals: z.object({
    requests: z.number().int(),
    costUSD: z.number(), // the sum of the lines that have a cost
    reworkCostUSD: z.number(), // the part of `costUSD` on rework lines
    // 'none' requests whose session, phase, rework flag and product have no turn cost row (of any
    // model: a turn cost with no model still covers its product's requests): requests whose cost
    // is in neither table. A turn cost is a record of one session, so it covers that session's
    // requests only. Above 0, `costUSD` is a lower bound.
    requestsWithoutCost: z.number().int(),
  }),
});
export type CostToLand = z.output<typeof costToLandSchema>;

export const stageTimeSchema = z.object({
  item: z.string(),
  environment: z.string(),
  // always seven, in the order of `stageSteps`
  steps: z.array(z.object({ step: z.enum(stageSteps), minutes: z.number().nullable(), endedAt: z.string().nullable() })),
  rework: z.object({ count: z.number().int(), minutes: z.number() }),
  reviewWaitMinutes: z.number().nullable(),
  sleepMinutes: z.number(),
  pullRequests: z.array(z.string()),
});
export type StageTime = z.output<typeof stageTimeSchema>;

// ── C. `boxxy_cost_to_land` ────────────────────────────────────────────────────────────────────
//
// What "landed" means in v1. boxxy never merges. An item has LANDED when a pull request that one
// of its attempts produced (the `produced` link) has `merged_at` in `github_pull_request`. The
// time is the earliest such `merged_at`. The merge agent's merge reaches pepys as a GitHub fact,
// so the definition needs no boxxy fact, and `boxxy_stage_time` reads the same column for its
// merge time. An item with no pull request never lands. A triage that ends `duplicate` or
// `declined` is one: it holds the item for the owner, who closes it, and the item has no pull
// request.
//
// An attempt whose `failure` is `no-capacity` is not an attempt of work.
// The worker refused its spawn for capacity, so it has no session, no request row and no cost.
// The cost query gives it no line and counts it in no total; it is never rework.
//
// Which attempt a telemetry row belongs to. Each row must count for exactly ONE attempt, or a
// phase line is wrong. The rule, for request rows and turn cost rows alike:
//   1. The row's `session_id` equals `boxxy_attempt_session.session_id`.
//      AND the row's proven sender is the caller of that attempt: `origin_issuer` =
//      `boxxy_attempt_session.caller_issuer` and `origin_subject` =
//      `boxxy_attempt_session.caller_subject`. Both joins below carry these two conditions.
//      This is the guard against forged telemetry. The session ID of a row is the sender's own
//      text; the origin is what pepys ingest proved, and the caller of an
//      attempt is from a signed boxxy fact. A row that a worker sends under another session's
//      ID has the worker's own origin and counts for nothing. A null caller on the boxxy side
//      counts nothing. No query of this package may read a telemetry table without this rule.
//   2. When that session has one attempt, the row is that attempt's, whatever its time.
//   3. When the session has several attempts, in this item or in ANY other (in v1: a kept
//      session, which carries a second build attempt of the same item), each attempt owns the
//      stretch from its `bound_at` to the next attempt's `bound_at`. The first owns everything
//      before the second; the last owns everything after. A row is in one stretch.
// So the windows are built over every attempt of the item's sessions, and only then cut down to
// this item. A session shared with another item is charged to each item for its own stretch.
//
// A Codex row. Codex reports no cost per request: the request row has `cost_usd` null and
// `cost_basis` 'none'. Its cost is per turn, in `telemetry_turn_cost` of
// `@pepys/source-telemetry`. The request lines group by `cost_basis`, so a 'none' line has
// `costUSD` null, not 0. The turn costs come out as 'turn' lines.
// `telemetry_turn_cost` has a nullable `model`. The 'turn' lines group by it, so they have the
// grain of the request lines: phase, rework, product, model. A turn cost row has no token count,
// so a 'turn' line has 0 requests and 0 tokens.
//
// Which attempts count. EVERY attempt of the item but a `no-capacity` one, whatever its state,
// outcome or failure: a live one, one that settled `lost` (`timed-out`, `item-closed`,
// `session-lost`), one that settled `unsettleable`, and one that failed with `usage-limit`. Its
// requests were made and paid for. The rework flag comes from `round` alone and tests no outcome
// name, so no outcome name changes a line.

export const boxxyCostToLandQuery = defineQuery({
  name: 'boxxy_cost_to_land',
  description:
    'Returns what one boxxy item cost to land: the model requests, tokens and cost of every attempt at the item, per phase, product and model, with rework apart. `landedAt` is null until a pull request of the item merges.',
  input: z.object({ item: z.string().describe('The item, as `boxxy:item:<id>`') }),
  output: costToLandSchema,
  reads: [boxxyWorkConsumer, telemetryModelRequestConsumer, telemetryTurnCostConsumer, githubPullRequestConsumer],
  handler: async (call) => {
    const item = call.input.item;

    // statement 1: the count of attempts
    // Built (slice 18): a `no-capacity` attempt counts in no total.
    const attempts = await call.db
      .selectFrom('boxxy_attempt')
      .where('item_id', '=', item)
      .select(sql<number>`count(*)`.as('count'))
      .executeTakeFirstOrThrow();

    // statement 2: landed
    const landed = await call.db
      .selectFrom('link_effective as produced')
      .innerJoin('boxxy_attempt as attempt', 'attempt.id', 'produced.from_id')
      .innerJoin('github_pull_request as pull_request', 'pull_request.id', 'produced.to_id')
      .where('produced.type', '=', 'produced')
      .where('attempt.item_id', '=', item)
      .select(sql<string | null>`min(pull_request.merged_at)`.as('landedAt'))
      .executeTakeFirstOrThrow();

    // statement 3: the request lines
    const requests = await withStretches(call, item)
      .selectFrom('stretch')
      .innerJoin('boxxy_attempt as attempt', 'attempt.id', 'stretch.attempt_id')
      .innerJoin('telemetry_model_request as request', (join) =>
        join
          .onRef('request.session_id', '=', 'stretch.session_id')
          .onRef('request.origin_issuer', '=', 'stretch.caller_issuer') // rule 1: the proven sender is the attempt's caller
          .onRef('request.origin_subject', '=', 'stretch.caller_subject'),
      )
      .where('attempt.item_id', '=', item)
      .where(isInStretch(sql.ref('request.at')))
      .groupBy(['attempt.phase', sql`attempt.round > 1`, 'request.product', 'request.model', 'request.cost_basis'])
      .select([
        'attempt.phase as phase',
        sql<number>`attempt.round > 1`.as('rework'),
        'request.product as product',
        'request.model as model',
        'request.cost_basis as costBasis',
        sql<number>`count(*)`.as('requests'),
        sql<number>`sum(request.input_tokens)`.as('inputTokens'),
        sql<number>`sum(request.cache_read_tokens)`.as('cacheReadTokens'),
        sql<number>`sum(request.cache_creation_tokens)`.as('cacheCreationTokens'),
        sql<number>`sum(request.output_tokens)`.as('outputTokens'),
        // `sum`, not `total`: a group whose every cost is null gives null, which is "not known"
        sql<number | null>`sum(request.cost_usd)`.as('costUSD'),
      ])
      .orderBy(['phase', 'rework', 'product', 'model', 'costBasis'])
      .execute();

    // statement 4: the turn cost lines, by the same rule
    const turns = await withStretches(call, item)
      .selectFrom('stretch')
      .innerJoin('boxxy_attempt as attempt', 'attempt.id', 'stretch.attempt_id')
      .innerJoin('telemetry_turn_cost as turn', (join) =>
        join
          .onRef('turn.session_id', '=', 'stretch.session_id')
          .onRef('turn.origin_issuer', '=', 'stretch.caller_issuer') // rule 1, as in statement 3
          .onRef('turn.origin_subject', '=', 'stretch.caller_subject'),
      )
      .where('attempt.item_id', '=', item)
      .where(isInStretch(sql.ref('turn.at')))
      .groupBy(['attempt.phase', sql`attempt.round > 1`, 'turn.product', 'turn.model'])
      .select(['attempt.phase as phase', sql<number>`attempt.round > 1`.as('rework'), 'turn.product as product', 'turn.model as model', sql<number>`sum(turn.cost_usd)`.as('costUSD')])
      .orderBy(['phase', 'rework', 'product', 'model'])
      .execute();

    // pure: SQLite's 0 and 1 to booleans, the 'turn' lines after the request lines, the totals
    return buildCostToLand({ item, landedAt: landed.landedAt, attempts: attempts.count, requests, turns });
  },
});

type CostCall = QueryCall<{ item: string }, readonly [typeof boxxyWorkConsumer, typeof telemetryModelRequestConsumer, typeof telemetryTurnCostConsumer, typeof githubPullRequestConsumer]>;

// The stretches, as a common table expression. One row per (attempt, session) of every session
// that an attempt of this item used:
//
//   with stretch as (
//     select bound.attempt_id, bound.session_id, bound.bound_at,
//            bound.caller_issuer, bound.caller_subject,            -- both cost joins read them
//            lead(bound.bound_at) over session_order as until_at,
//            row_number() over session_order as position
//     from boxxy_attempt_session as bound
//     where bound.session_id in (
//       select own.session_id from boxxy_attempt_session as own
//       inner join boxxy_attempt as attempt on attempt.id = own.attempt_id
//       where attempt.item_id = :item)
//     window session_order as (partition by bound.session_id order by bound.bound_at, bound.attempt_id)
//   )
function withStretches(call: CostCall, item: string) {
  return call.db.with('stretch', (db) =>
    db
      .selectFrom('boxxy_attempt_session as bound')
      .where(
        'bound.session_id',
        'in',
        db
          .selectFrom('boxxy_attempt_session as own')
          .innerJoin('boxxy_attempt as attempt', 'attempt.id', 'own.attempt_id')
          .where('attempt.item_id', '=', item)
          .select('own.session_id'),
      )
      .select([
        'bound.attempt_id',
        'bound.session_id',
        'bound.bound_at',
        // The two columns that both cost joins read. Without them in this select, SQLite
        // answers `no such column` for both joins, for every item.
        'bound.caller_issuer',
        'bound.caller_subject',
        sql<string | null>`lead(bound.bound_at) over (partition by bound.session_id order by bound.bound_at, bound.attempt_id)`.as('until_at'),
        sql<number>`row_number() over (partition by bound.session_id order by bound.bound_at, bound.attempt_id)`.as('position'),
      ]),
  );
}

// Rule 3 above. `julianday` and not a text compare: boxxy writes `…:00.000Z` and GitHub and some
// telemetry records write `…:00Z`, and as text 'Z' sorts after '.'.
function isInStretch(at: Expression<string>): Expression<SqlBool> {
  return sql<SqlBool>`(stretch.position = 1 or julianday(${at}) >= julianday(stretch.bound_at))
    and (stretch.until_at is null or julianday(${at}) < julianday(stretch.until_at))`;
}

declare function buildCostToLand(parts: {
  item: string;
  landedAt: string | null;
  attempts: number;
  requests: readonly { phase: string; rework: number; product: string; model: string; costBasis: string; requests: number; inputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; outputTokens: number; costUSD: number | null }[];
  turns: readonly { phase: string; rework: number; product: string; model: string | null; costUSD: number }[];
}): CostToLand;

// ── D. `boxxy_stage_time` ──────────────────────────────────────────────────────────────────────
//
// ONE query, TWO statements, one call from boxxy. Statement 1 reads the item's attempts and
// gives the four phases, rework, review wait and sleep. Statement 2 is the GitHub plug-in's
// stage-times module, `selectPullRequestDelivery`, joined to boxxy's `produced` link, and gives
// merge, release and deploy. They are two statements because the module starts from
// `pull_request`: one joined statement would return no row, and so no phase time, for an item
// with no pull request yet.
//
// Each measure is the catalog's (../core/04-facts.ts, section D), computed here in TypeScript from
// the rows, so the definition has one home:
//
//   a phase's minutes   the sum, over the SETTLED attempts of the phase, of
//                       `ended_at` − `claimed_at` − the attempt's sleep. null: none has settled.
//                       `endedAt`: the latest `ended_at` of the phase.
//   merge               `mergedAt` − the latest `ended_at` of a review attempt with the outcome
//                       `passed`. Never below 0. null when either is absent.
//   release             `release.at` − `mergedAt`.     deploy   `deploy.at` − `release.at`.
//                       An item with two pull requests takes the earliest of each time.
//   rework.count        the settled attempts with phase `review` and outcome `changes-requested`
//   rework.minutes      the minutes, by the phase rule, of every attempt with `round` above 1
//   reviewWaitMinutes   for each settled build with the outcome `built`: the `claimed_at` of the
//                       review claimed next at or after that build's `ended_at` − that `ended_at`.
//                       The sum. `number` counts within one phase, so it cannot order the two.
//                       null when no build has a review after it.
//   sleepMinutes        the sum of every closed stretch in `sleeps`. A stretch with `to` null
//                       (asleep now) counts 0: the query reads no clock.
//
// Every measure above leaves out an attempt whose `failure` is `no-capacity`. The worker
// refused its spawn for capacity, so it is not an attempt of work: it adds no minutes to its
// phase and sets no `endedAt`, it is no rework (count or minutes), and it is not "the next review
// attempt" of the review wait. The statement filters it out before the measures are computed.
// An attempt that failed with `usage-limit` did run, so its time counts.
//
// `passed`, `built` and `changes-requested` are outcome names of boxxy's phase kinds
// (../core/01-usage.ts). The query names them, so a phase kind that renames one must change this
// file.
//
// How an attempt that did not settle with a phase kind's outcome counts. The phase rule tests
// `ended_at` only, so each one counts in its phase's minutes: the time was spent.
//   outcome `unsettleable`           in the phase's minutes (the catalog says so). Not a rework
//   (failure `closeout-              round, not a passed review, not a `built` build: the engine's
//   unsettleable`)                   two outcome names can equal none of the three constants,
//                                    because the loader refuses a phase kind that lists them.
//   outcome `lost`, failure          in the phase's minutes, up to the stop. A review that timed
//   `timed-out`                      out starts no merge step and adds no rework round.
//   outcome `lost`, failure          in the phase's minutes, up to the close. An attempt that
//   `item-closed`                    was asleep at the close has its last stretch of sleep ended
//                                    at the settle time, so that stretch is not in the minutes.
// What follows from it: a build that settled `unsettleable` has no review wait, and an item whose
// only review settled `unsettleable` has null merge minutes even after its pull request merged.
//
// `sleepMinutes` includes every sleep, the unattended sleep (`sleep-unattended`) too. It writes
// the same `boxxy.attempt.slept` fact as an idle sleep, and the payload names no cause, so the
// query cannot report it apart. The phase minutes leave all sleep out.
//
// A deleted release. The GitHub plug-in's `selectPullRequestDelivery` leaves out a release with
// `deleted_at` set. This query reads no release column itself, so it follows the module and
// names `deleted_at` nowhere.

const outcomeNames = { built: 'built', passed: 'passed', changesRequested: 'changes-requested' } as const;

export const boxxyStageTimeQuery = defineQuery({
  name: 'boxxy_stage_time',
  description:
    'Returns how long one boxxy item took in each of seven steps (triage, design, build, review, merge, release, deploy), its rework rounds and time, its wait for review and its sleep time. A step that has not happened has null minutes.',
  input: z.object({
    item: z.string().describe('The item, as `boxxy:item:<id>`'),
    environment: z.string().describe('The environment whose deploy counts, such as `production`'),
  }),
  output: stageTimeSchema,
  reads: [boxxyWorkConsumer, ...githubDeliveryConsumers],
  handler: async (call) => {
    // statement 1: the attempts, oldest first
    // Built (slice 18): a `no-capacity` attempt is left out of every measure.
    const attempts = await call.db
      .selectFrom('boxxy_attempt')
      .where('item_id', '=', call.input.item)
      .select(['id', 'phase', 'number', 'round', 'state', 'outcome', 'claimed_at', 'ended_at', 'sleeps'])
      .orderBy('number')
      .execute();

    // statement 2: one row per pull request of the item, through boxxy's own `produced` link
    // The module takes an optional `target`. This query passes none in v1, so a
    // deploy of any target counts; the mapping from a package to a target is out of v1.
    const deliveries = await selectPullRequestDelivery(call.db, { environment: call.input.environment })
      .innerJoin('link_effective as produced', (join) => join.onRef('produced.to_id', '=', 'pull_request.id').on('produced.type', '=', 'produced'))
      .innerJoin('boxxy_attempt as attempt', 'attempt.id', 'produced.from_id')
      .where('attempt.item_id', '=', call.input.item)
      .execute();

    // pure; `Date.parse` is fine here: a query handler runs on Bun, not in a consumer module
    return buildStageTime({ item: call.input.item, environment: call.input.environment, attempts, deliveries, outcomeNames });
  },
});

declare function buildStageTime(parts: {
  item: string;
  environment: string;
  attempts: readonly { id: unknown; phase: unknown; number: unknown; round: unknown; state: unknown; outcome: unknown; claimed_at: unknown; ended_at: unknown; sleeps: unknown }[];
  // PullRequestDeliveryRow of the GitHub plug-in; two attempts that produced one pull request
  // give two equal rows, and the earliest-of rule makes that harmless
  deliveries: readonly { pullRequest: string; mergedAt: string | null; release: { id: string; tag: string; at: string } | null; deploy: { id: string; at: string; signal: string } | null }[];
  outcomeNames: typeof outcomeNames;
}): StageTime;

// Columns each query reads, and the consumer that writes each:
//   boxxy_attempt.{id, item_id, phase, number, round, state, outcome, claimed_at, ended_at, sleeps},
//   boxxy_attempt_session.{attempt_id, session_id, bound_at}, link_effective (`produced`)   boxxy_work
//   boxxy_attempt_session.{caller_issuer, caller_subject}                                   boxxy_work
//   telemetry_model_request.{origin_issuer, origin_subject}, and the same two columns of
//   telemetry_turn_cost                                                                     the two telemetry consumers
//   telemetry_model_request.{session_id, product, model, cost_basis, cost_usd, at, the four token
//   columns}                                                                                telemetry_model_request
//   telemetry_turn_cost.{session_id, product, model, cost_usd, at}                          telemetry_turn_cost
//   github_pull_request.{id, merged_at}, and what selectPullRequestDelivery reads           the four GitHub consumers
// No column that a query reads is without a writer.
