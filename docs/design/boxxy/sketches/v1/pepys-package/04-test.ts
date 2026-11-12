// boxxy pepys package, file 4 of 4: boxxy repo, packages/pepys/src/boxxy-work.test.ts
// The consumer and both queries, from inline facts, on the kit's test store. Not compiled or run.
//
// What `createTestStore` of `@pepys/testing` runs: the entry file as TypeScript on Bun, one
// in-memory database, the host's link check and replace-a-scope rule in TypeScript, the query
// handlers on Kysely.
// Not checked: the scriptc compile and the Rust host. The test store proves neither.

import { expect, test } from 'bun:test';
import { createTestStore } from '@pepys/testing';
import type { OutgoingFact, TableRow } from '@pepys/kit';
import { githubDeployConsumer, githubPlugin, githubPullRequestConsumer, githubReleaseConsumer } from '@pepys/source-github';
import { telemetryModelRequestConsumer, telemetryPlugin, telemetryTurnCostConsumer } from '@pepys/source-telemetry';
import type { FactType } from '@boxxy/model';
import { boxxyPlugin, boxxySource } from './01-package.ts';
import { boxxyCostToLandQuery, boxxyStageTimeQuery } from './02-queries.ts';

// The family parses each payload with the `@boxxy/model` schemas, so every ID has the form its
// brand schema asks for: a UUID version 7 for an item and an attempt.
const item = '0193a1b2-0000-7000-8000-000000000001';
const scope = `boxxy:item:${item}` as const;
const attempt = {
  triage: '0193a1b2-0000-7000-8000-0000000000a1',
  build: '0193a1b2-0000-7000-8000-0000000000a2',
  review: '0193a1b2-0000-7000-8000-0000000000a3',
  rebuild: '0193a1b2-0000-7000-8000-0000000000a4',
  rereview: '0193a1b2-0000-7000-8000-0000000000a5',
};
const pullRequest = 'github:pull_request:9001';

type WorkFact = OutgoingFact<typeof boxxySource>;

// @boxxy/model/test-utils/build-mock-work-fact.ts, which the build adds. It fills every payload
// field the test does not give with a valid value, makes a new event ID, and adds `storeVersion`.
declare function buildMockWorkFact<Type extends FactType>(type: Type, fact: { entity: `boxxy:item:${string}`; at: string; payload: Readonly<Record<string, unknown>> }): WorkFact;

const day = '2026-11-11T';
const fact = <Type extends FactType>(type: Type, time: string, payload: Readonly<Record<string, unknown>>, entity: `boxxy:item:${string}` = scope) =>
  buildMockWorkFact(type, { entity, at: `${day}${time}.000Z`, payload });

// v1 workers are Claude; Codex is not a worker in v1. The review sessions below report the
// product `codex` all the same: the fixture keeps a second product so that the cost lines per
// product and the turn-cost path are tested. It is not what v1 runs.
// One item: triage, a build that slept for 20 minutes, a review that asked for changes, a second
// build IN THE FIRST BUILD'S SESSION, and a review that passed.
const facts: readonly WorkFact[] = [
  fact('boxxy.item.filed', '02:00:00', { id: item, title: 'Chart the shoals', repo: 'shoal/charts', fields: {} }),

  fact('boxxy.attempt.claimed', '02:01:00', { attempt: attempt.triage, phase: 'triage', number: 1, round: 1 }),
  fact('boxxy.attempt.started', '02:01:05', { attempt: attempt.triage, atcSession: 's-triage' }),
  fact('boxxy.attempt.settled', '02:05:00', { attempt: attempt.triage, phase: 'triage', round: 1, state: 'succeeded', outcome: 'accepted', asleep: false }),

  fact('boxxy.attempt.claimed', '02:10:00', { attempt: attempt.build, phase: 'build', number: 2, round: 1 }),
  fact('boxxy.attempt.started', '02:10:05', { attempt: attempt.build, atcSession: 's-build' }),
  // the same `at` as `started`: the module must not rest on which of the two comes first
  fact('boxxy.attempt.session_bound', '02:10:05', { attempt: attempt.build, atcSession: 's-build', agentSession: 'agent-7', product: 'claude_code', source: 'hook' }),
  fact('boxxy.pull_request.linked', '02:25:00', { attempt: attempt.build, repo: 'shoal/charts', number: 14, pullRequestId: '9001', source: 'hook' }),
  fact('boxxy.attempt.slept', '02:30:00', { attempt: attempt.build, asked: true }),
  fact('boxxy.attempt.woken', '02:50:00', { attempt: attempt.build }),
  fact('boxxy.attempt.settled', '03:10:00', { attempt: attempt.build, phase: 'build', round: 1, state: 'succeeded', outcome: 'built', asleep: false }),

  fact('boxxy.attempt.claimed', '03:16:00', { attempt: attempt.review, phase: 'review', number: 3, round: 1 }),
  fact('boxxy.attempt.started', '03:16:05', { attempt: attempt.review, atcSession: 's-review' }),
  fact('boxxy.attempt.settled', '03:36:00', { attempt: attempt.review, phase: 'review', round: 1, state: 'succeeded', outcome: 'changes-requested', asleep: false }),

  fact('boxxy.attempt.claimed', '03:40:00', { attempt: attempt.rebuild, phase: 'build', number: 4, round: 2 }),
  // the session that served the first build serves the second
  fact('boxxy.attempt.started', '03:40:05', { attempt: attempt.rebuild, atcSession: 's-build' }),
  fact('boxxy.attempt.settled', '04:10:00', { attempt: attempt.rebuild, phase: 'build', round: 2, state: 'succeeded', outcome: 'built', asleep: false }),

  fact('boxxy.attempt.claimed', '04:12:00', { attempt: attempt.rereview, phase: 'review', number: 5, round: 2 }),
  fact('boxxy.attempt.started', '04:12:05', { attempt: attempt.rereview, atcSession: 's-rereview' }),
  fact('boxxy.attempt.settled', '04:30:00', { attempt: attempt.rereview, phase: 'review', round: 2, state: 'succeeded', outcome: 'passed', asleep: false }),
];

// Assumed: `readRows` and `readLinks` return rows in primary key order.
// The other two plug-ins are in every store: boxxy's links name their kinds, and its queries
// read their tables.
const plugins = [boxxyPlugin, telemetryPlugin, githubPlugin];

// `started` and `session_bound` of the first build share one `at` (02:10:05), and two facts
// with an equal `at` can come in either order. Both orders must give equal rows and
// equal links, the `evidence` of `ran_in` included.
test('it builds the same links when two facts with one time arrive in either order', async () => {
  await using first = await createTestStore({ plugins });
  await using second = await createTestStore({ plugins });
  const started = fact('boxxy.attempt.started', '02:10:05', { attempt: attempt.build, atcSession: 's-build' });
  const bound = fact('boxxy.attempt.session_bound', '02:10:05', { attempt: attempt.build, atcSession: 's-build', agentSession: 'agent-7', product: 'claude_code', source: 'hook' });
  const claimed = fact('boxxy.attempt.claimed', '02:10:00', { attempt: attempt.build, phase: 'build', number: 2, round: 1 });

  await first.apply(boxxySource, [claimed, started, bound]);
  await second.apply(boxxySource, [claimed, bound, started]);

  expect(await second.readRows('boxxy_attempt_session')).toStrictEqual(await first.readRows('boxxy_attempt_session'));
  expect(await second.readLinks()).toStrictEqual(await first.readLinks());
});

test('it builds the same rows and links from the facts in any order, with a batch sent twice', async () => {
  await using inOrder = await createTestStore({ plugins });
  await using shuffled = await createTestStore({ plugins });

  await inOrder.apply(boxxySource, facts);
  // Last fact first, then every fact again. The reversed list comes first, because the store
  // drops the second copy of a fact ID. The copies have the same event IDs.
  await shuffled.apply(boxxySource, [...facts.toReversed(), ...facts]);

  for (const table of ['boxxy_item', 'boxxy_attempt', 'boxxy_attempt_session']) {
    expect(await shuffled.readRows(table)).toStrictEqual(await inOrder.readRows(table));
  }

  expect(await shuffled.readLinks()).toStrictEqual(await inOrder.readLinks());

  expect(await inOrder.readRows('boxxy_attempt')).toMatchObject([
    { id: `boxxy:attempt:${attempt.triage}`, item_id: scope, phase: 'triage', round: 1, state: 'succeeded', outcome: 'accepted', claimed_at: `${day}02:01:00.000Z`, ended_at: `${day}02:05:00.000Z`, sleeps: [] },
    { id: `boxxy:attempt:${attempt.build}`, phase: 'build', atc_session: 's-build', outcome: 'built', sleeps: [{ from: `${day}02:30:00.000Z`, to: `${day}02:50:00.000Z` }] },
    { id: `boxxy:attempt:${attempt.review}`, phase: 'review', outcome: 'changes-requested' },
    { id: `boxxy:attempt:${attempt.rebuild}`, phase: 'build', round: 2, atc_session: 's-build' },
    { id: `boxxy:attempt:${attempt.rereview}`, phase: 'review', round: 2, outcome: 'passed' },
  ]);

  // the first build has two rows: its atc session, and its agent session as the fallback key
  expect(await inOrder.readRows('boxxy_attempt_session')).toMatchObject([
    { attempt_id: `boxxy:attempt:${attempt.triage}`, session_id: 'telemetry:session:s-triage', key: 'atc' },
    { attempt_id: `boxxy:attempt:${attempt.build}`, session_id: 'telemetry:session:agent-7', key: 'agent', product: 'claude_code', bound_at: `${day}02:10:05.000Z` },
    { attempt_id: `boxxy:attempt:${attempt.build}`, session_id: 'telemetry:session:s-build', key: 'atc', bound_at: `${day}02:10:05.000Z` },
    { attempt_id: `boxxy:attempt:${attempt.review}`, session_id: 'telemetry:session:s-review' },
    { attempt_id: `boxxy:attempt:${attempt.rebuild}`, session_id: 'telemetry:session:s-build', bound_at: `${day}03:40:05.000Z` },
    { attempt_id: `boxxy:attempt:${attempt.rereview}`, session_id: 'telemetry:session:s-rereview' },
  ]);

  const links = (await inOrder.readLinks()).map((link) => `${link.type} ${link.from_id} ${link.to_id}`);

  // 5 `attempt_of`, 6 `ran_in`, 1 `produced`; each owned by the item's scope
  expect(links).toHaveLength(12);
  expect(links).toContain(`produced boxxy:attempt:${attempt.build} ${pullRequest}`);
  expect(links).toContain(`ran_in boxxy:attempt:${attempt.rebuild} telemetry:session:s-build`);
  expect(links).toContain(`attempt_of boxxy:attempt:${attempt.triage} ${scope}`);
  expect((await inOrder.readLinks()).every((link) => link.origin === 'boxxy_work' && link.scope === scope)).toBe(true);
});

test('it writes no row and no link for an attempt whose claimed fact has not arrived', async () => {
  await using store = await createTestStore({ plugins });

  await store.apply(boxxySource, [fact('boxxy.attempt.started', '02:01:05', { attempt: attempt.triage, atcSession: 's-triage' })]);

  expect(await store.readRows('boxxy_attempt')).toStrictEqual([]);
  expect(await store.readRows('boxxy_attempt_session')).toStrictEqual([]);
  expect(await store.readLinks()).toStrictEqual([]);

  // the `claimed` fact arrives late, as a parked outbox row does: the row, the session row and both links appear
  await store.apply(boxxySource, [fact('boxxy.attempt.claimed', '02:01:00', { attempt: attempt.triage, phase: 'triage', number: 1, round: 1 })]);

  expect(await store.readRows('boxxy_attempt')).toMatchObject([{ id: `boxxy:attempt:${attempt.triage}`, atc_session: 's-triage', started_at: `${day}02:01:05.000Z` }]);
  expect(await store.readRows('boxxy_attempt_session')).toHaveLength(1);
  expect((await store.readLinks()).map((link) => link.type).toSorted()).toStrictEqual(['attempt_of', 'ran_in']);
});

test('it counts each model request for one attempt, splits rework out, and keeps an unknown cost apart from zero', async () => {
  await using store = await createTestStore({ plugins });

  await store.apply(boxxySource, facts);

  // ANOTHER item's attempt takes the session `s-build` at 04:40. A query that built the windows
  // from this item's attempts alone would charge the 04:45 request below to this item's rework.
  const otherScope = 'boxxy:item:0193a1b2-0000-7000-8000-000000000002';
  const otherAttempt = '0193a1b2-0000-7000-8000-0000000000b1';

  await store.apply(boxxySource, [
    fact('boxxy.attempt.claimed', '04:39:00', { attempt: otherAttempt, phase: 'build', number: 1, round: 1 }, otherScope),
    fact('boxxy.attempt.started', '04:40:00', { attempt: otherAttempt, atcSession: 's-build' }, otherScope),
  ]);

  // Rows of a table that another plug-in owns go in directly; its consumer does not run.
  await store.seed(telemetryModelRequestConsumer, 'telemetry_model_request', [
    // in `s-build` before the second build was bound: the first build's
    buildMockModelRequest({ id: 'telemetry:model_request:claude_code.api_request:req_01', session_id: 'telemetry:session:s-build', cost_usd: 0.5, at: `${day}02:20:00.000Z` }),
    // a record with no atc session ID: its session is the agent's own, and the fallback row finds it
    buildMockModelRequest({ id: 'telemetry:model_request:claude_code.api_request:req_02', session_id: 'telemetry:session:agent-7', cost_usd: 0.25, at: `${day}02:26:00.000Z` }),
    // in `s-build` after the second build was bound: rework. The time has no fraction, on purpose.
    buildMockModelRequest({ id: 'telemetry:model_request:claude_code.api_request:req_03', session_id: 'telemetry:session:s-build', cost_usd: 0.25, at: `${day}03:50:00Z` }),
    // in `s-build` after the other item's attempt was bound: not this item's
    buildMockModelRequest({ id: 'telemetry:model_request:claude_code.api_request:req_04', session_id: 'telemetry:session:s-build', cost_usd: 9, at: `${day}04:45:00.000Z` }),
    // Codex: no cost on the request row
    buildMockModelRequest({ id: 'telemetry:model_request:codex.sse_event:h-5e1c', session_id: 'telemetry:session:s-review', product: 'codex', model: 'model-small', cost_usd: null, cost_basis: 'none', at: `${day}03:20:00.000Z` }),
  ]);

  await store.seed(telemetryTurnCostConsumer, 'telemetry_turn_cost', [
    // the row has a model, so its 'turn' line has one
    { id: 'telemetry:turn_cost:codex.turn_cost:t-1', session_id: 'telemetry:session:s-review', agent_session: 'x-4', product: 'codex', model: 'model-small', cost_usd: 0.125, at: `${day}03:21:00.000Z` },
  ]);

  await store.seed(githubPullRequestConsumer, 'github_pull_request', [buildMockPullRequestRow({ id: pullRequest, merged_at: `${day}05:00:00Z` })]);

  const tokens = { inputTokens: 10, cacheReadTokens: 100, cacheCreationTokens: 0, outputTokens: 20 };

  expect(await store.query(boxxyCostToLandQuery, { item: scope })).toStrictEqual({
    item: scope,
    landedAt: `${day}05:00:00Z`,
    attempts: 5,
    lines: [
      { phase: 'build', rework: false, product: 'claude_code', model: 'model-large', requests: 2, inputTokens: 20, cacheReadTokens: 200, cacheCreationTokens: 0, outputTokens: 40, costUSD: 0.75, costBasis: 'reported' },
      { phase: 'build', rework: true, product: 'claude_code', model: 'model-large', requests: 1, ...tokens, costUSD: 0.25, costBasis: 'reported' },
      { phase: 'review', rework: false, product: 'codex', model: 'model-small', requests: 1, ...tokens, costUSD: null, costBasis: 'none' },
      { phase: 'review', rework: false, product: 'codex', model: 'model-small', requests: 0, inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 0, costUSD: 0.125, costBasis: 'turn' },
    ],
    // the Codex request's session has a turn cost for its phase and product, so it is not "without cost"
    totals: { requests: 4, costUSD: 1.125, reworkCostUSD: 0.25, requestsWithoutCost: 0 },
  });
});

test('it reports the cost so far, with no landing time, for an item whose pull request has not merged', async () => {
  await using store = await createTestStore({ plugins });

  await store.apply(boxxySource, facts);

  expect(await store.query(boxxyCostToLandQuery, { item: scope })).toStrictEqual({
    item: scope,
    landedAt: null,
    attempts: 5,
    lines: [],
    totals: { requests: 0, costUSD: 0, reworkCostUSD: 0, requestsWithoutCost: 0 },
  });
});

test('it gives the minutes of all seven steps, the rework, the review wait and the sleep time', async () => {
  await using store = await createTestStore({ plugins });

  await store.apply(boxxySource, facts);

  // The item's pull request merges at 05:00. Its repository publishes a release at 05:30. A pull
  // request in the deployment repository pins that release and merges at 05:40, and a deploy of
  // that repository to production reports at 06:10. With no `github_commit` row, each row's own
  // time stands in for its commit time (a rule of the GitHub plug-in's delivery module).
  await store.seed(githubPullRequestConsumer, 'github_pull_request', [
    buildMockPullRequestRow({ id: pullRequest, repository_id: 'github:repository:101', merge_commit_sha: 'c0ffee1', merged_at: `${day}05:00:00Z` }),
    buildMockPullRequestRow({ id: 'github:pull_request:9002', repository_id: 'github:repository:202', merge_commit_sha: 'c0ffee3', merged_at: `${day}05:40:00Z` }),
  ]);
  await store.seed(githubPullRequestConsumer, 'github_release_bump', [{ pull_request_id: 'github:pull_request:9002', release_repository: 'shoal/charts', release_tag: 'v1.4.0' }]);
  await store.seed(githubReleaseConsumer, 'github_release', [
    buildMockReleaseRow({ id: 'github:release:501', repository_id: 'github:repository:101', repository_full_name: 'shoal/charts', tag_name: 'v1.4.0', target_commitish: 'c0ffee2', deleted_at: null, created_at: `${day}05:29:00Z`, published_at: `${day}05:30:00Z` }),
  ]);
  // `target` is null: `boxxy_stage_time` passes no target to the delivery module in v1
  await store.seed(githubDeployConsumer, 'github_deploy', [
    { id: 'github:deploy:202:production:tag:c0ffee4', repository_id: 'github:repository:202', environment: 'production', target: null, sha: 'c0ffee4', signal: 'tag', deployed_at: `${day}06:10:00Z` },
  ]);

  expect(await store.query(boxxyStageTimeQuery, { item: scope, environment: 'production' })).toStrictEqual({
    item: scope,
    environment: 'production',
    steps: [
      { step: 'triage', minutes: 4, endedAt: `${day}02:05:00.000Z` },
      { step: 'design', minutes: null, endedAt: null },
      // 60 minutes less 20 asleep, then 30
      { step: 'build', minutes: 70, endedAt: `${day}04:10:00.000Z` },
      { step: 'review', minutes: 38, endedAt: `${day}04:30:00.000Z` },
      { step: 'merge', minutes: 30, endedAt: `${day}05:00:00Z` },
      { step: 'release', minutes: 30, endedAt: `${day}05:30:00Z` },
      { step: 'deploy', minutes: 40, endedAt: `${day}06:10:00Z` },
    ],
    // one review asked for changes; the second build and the second review are rework
    rework: { count: 1, minutes: 48 },
    // 03:10 to 03:16, and 04:10 to 04:12
    reviewWaitMinutes: 8,
    sleepMinutes: 20,
    pullRequests: [pullRequest],
  });
});

test('it gives the four phases of an item that has no pull request yet', async () => {
  await using store = await createTestStore({ plugins });

  await store.apply(boxxySource, facts.filter((each) => each.type !== 'boxxy.pull_request.linked'));

  const answer = await store.query(boxxyStageTimeQuery, { item: scope, environment: 'production' });

  expect(answer.steps.map((step) => step.minutes)).toStrictEqual([4, null, 70, 38, null, null, null]);
  expect(answer.pullRequests).toStrictEqual([]);
});

// Three attempts that settled with none of a phase kind's outcomes (`item-closed`, `timed-out`,
// `closeout-unsettleable`), and a sleep that the close ended.
test('it counts the time of an unsettleable, a timed-out and a closed attempt in its phase, and none of them as rework', async () => {
  await using store = await createTestStore({ plugins });

  const design = '0193a1b2-0000-7000-8000-0000000000c1';
  const build = '0193a1b2-0000-7000-8000-0000000000c2';
  const review = '0193a1b2-0000-7000-8000-0000000000c3';

  await store.apply(boxxySource, [
    fact('boxxy.item.filed', '02:00:00', { id: item, title: 'Chart the shoals', repo: 'shoal/charts', fields: {} }),

    // an attended design that was put to sleep unattended at 03:00 and was asleep when the item closed
    fact('boxxy.attempt.claimed', '02:00:00', { attempt: design, phase: 'design', number: 1, round: 1, mode: 'attended' }),
    fact('boxxy.attempt.slept', '03:00:00', { attempt: design, asked: true }),
    fact('boxxy.attempt.settled', '03:30:00', { attempt: design, phase: 'design', round: 1, state: 'failed', failure: 'item-closed', outcome: 'lost', closing: null, asleep: true }),

    fact('boxxy.attempt.claimed', '04:00:00', { attempt: build, phase: 'build', number: 2, round: 1 }),
    fact('boxxy.attempt.settled', '04:25:00', { attempt: build, phase: 'build', round: 1, state: 'failed', failure: 'timed-out', outcome: 'lost', closing: 'timed-out', asleep: false }),

    fact('boxxy.attempt.claimed', '05:00:00', { attempt: review, phase: 'review', number: 3, round: 1 }),
    fact('boxxy.attempt.settled', '05:10:00', { attempt: review, phase: 'review', round: 1, state: 'failed', failure: 'closeout-unsettleable', outcome: 'unsettleable', returnedOutcome: 'approved', asleep: false }),
  ]);

  const answer = await store.query(boxxyStageTimeQuery, { item: scope, environment: 'production' });

  // design: 90 minutes less 30 asleep. build: 25. review: 10.
  expect(answer.steps.map((step) => step.minutes)).toStrictEqual([null, 60, 25, 10, null, null, null]);
  expect(answer.rework).toStrictEqual({ count: 0, minutes: 0 });
  expect(answer.reviewWaitMinutes).toBeNull();
  expect(answer.sleepMinutes).toBe(30);
});

// Row builders of the other two plug-ins. Each fills every column of its table; the tests give
// the columns they assert on.
// Assumed: they are exports of `@pepys/source-telemetry/test-utils` and
// `@pepys/source-github/test-utils`. This sketch does not show them.
// Defaults of a model request: product 'claude_code', model 'model-large', cost_basis 'reported',
// input_tokens 10, cache_read_tokens 100, cache_creation_tokens 0, output_tokens 20.
declare function buildMockModelRequest(overrides: Partial<TableRow<(typeof telemetryModelRequestConsumer)['tables']['telemetry_model_request']>>): TableRow<(typeof telemetryModelRequestConsumer)['tables']['telemetry_model_request']>;
declare function buildMockPullRequestRow(overrides: Partial<TableRow<(typeof githubPullRequestConsumer)['tables']['github_pull_request']>>): TableRow<(typeof githubPullRequestConsumer)['tables']['github_pull_request']>;
declare function buildMockReleaseRow(overrides: Partial<TableRow<(typeof githubReleaseConsumer)['tables']['github_release']>>): TableRow<(typeof githubReleaseConsumer)['tables']['github_release']>;
