import { expect, test } from 'bun:test';
import type { Criterion } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { buildMockPauseChange } from '../test-utils/build-mock-pause-change.ts';
import { buildMockShippedChange } from '../test-utils/build-mock-shipped-change.ts';
import { createFakeForge } from '../test-utils/create-fake-forge.ts';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { loadShipRules } from '../test-utils/load-ship-rules.ts';
import { loadVerifyRules } from '../test-utils/load-verify-rules.ts';
import { seedMergedItem, seededMergeCommit } from '../test-utils/seed-merged-item.ts';
import { claimNext } from './claim-next.ts';

async function setupTest(
  gates: { review?: string[]; verifyProd?: boolean } = {},
  repos?: Parameters<typeof createTestDispatch>[0],
) {
  const dispatch = await createTestDispatch(repos);

  const forge = createFakeForge();

  dispatch.setRules(
    loadVerifyRules({
      session: 'fresh',
      resume: false,
      gates: {
        criterionTags: ['prod', 'qa'],
        ...(gates.review === undefined ? {} : { review: gates.review }),
        ...(gates.verifyProd === true
          ? {
              verify: [
                '      criteria: { tagged: prod }',
                '      skip: { end: nothing-to-check-live }',
              ],
            }
          : {}),
      },
    }),
  );

  const prod = ['prod'];

  return {
    ...dispatch,
    forge,
    prod,
    buildCriterion: (id: string, text: string, tags?: readonly string[]): Criterion => ({
      id: brandSchemas.criterionId.parse(id),
      text,
      evidence: [],
      ...(tags === undefined ? {} : { tags }),
    }),
    claim: () =>
      claimNext({
        store: dispatch.store,
        runner: dispatch.runner,
        rules: dispatch.rules(),
        now: dispatch.clock.now(),
        newId: dispatch.newId,
        backoff: dispatch.backoff,
        spawn: dispatch.spawn,
        forge,
      }),
    claimAt: (now: ReturnType<typeof dispatch.clock.now>) =>
      claimNext({
        store: dispatch.store,
        runner: dispatch.runner,
        rules: dispatch.rules(),
        now,
        newId: dispatch.newId,
        backoff: dispatch.backoff,
        spawn: dispatch.spawn,
        forge,
      }),
    readItem: async (item: Parameters<typeof dispatch.closeItem>[0]) => {
      const view = await dispatch.store.read((tx) =>
        tx.readItem(item, dispatch.clock.now(), dispatch.rules()),
      );

      invariant(view !== null, 'the item is stored');

      return view;
    },
    listAttempts: (item: Parameters<typeof dispatch.closeItem>[0]) =>
      dispatch.store.read((tx) => tx.listItemAttempts(item)),
    listNotices: () => dispatch.store.read((tx) => tx.listUnsentNotices(10)),
    useShipRules: (lines: readonly string[]) => {
      dispatch.setRules(loadShipRules({ repos: lines }));
    },
    mergeItem: (tags: readonly string[]) => seedMergedItem(dispatch, forge, tags),
  };
}

test('it skips a step whose criteria gate finds no tagged line, and records the skip', async () => {
  const ctx = await setupTest({ verifyProd: true });
  const item = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('verify') });
  const result = await ctx.claim();
  const attempts = await ctx.listAttempts(item);
  const view = await ctx.readItem(item);
  const facts = await ctx.listFacts('boxxy.attempt.skipped');

  const received: unknown = result;

  expect(received).toStrictEqual({
    skips: [{ kind: 'skipped', itemId: item, phase: 'verify', reason: 'no-criteria-tagged:prod' }],
    pick: null,
  });

  expect(attempts).toMatchObject([
    {
      phase: 'verify',
      number: 1,
      state: 'succeeded',
      outcome: 'skipped',
      worker: 'skip',
      skipReason: 'no-criteria-tagged:prod',
      pool: null,
      spawnRequest: null,
      spawnRequestHash: null,
      atcSession: null,
      leaseGen: 0,
    },
  ]);

  const position: unknown = view.position;
  const payloads: unknown = facts.map((fact) => fact.payload);

  expect(position).toStrictEqual({ kind: 'end', reason: 'nothing-to-check-live' });

  expect(payloads).toStrictEqual([
    {
      attemptId: attempts[0]?.id,
      itemId: item,
      phase: 'verify',
      round: 2,
      reason: 'no-criteria-tagged:prod',
    },
  ]);
});

test('it skips the step of an item with no acceptance line', async () => {
  const ctx = await setupTest({ verifyProd: true });

  const item = await ctx.seedItem({
    phase: brandSchemas.phaseName.parse('verify'),
    acceptance: [],
  });

  const result = await ctx.claim();
  const view = await ctx.readItem(item);

  const received: unknown = [result, view.position];

  expect(received).toStrictEqual([
    {
      skips: [
        { kind: 'skipped', itemId: item, phase: 'verify', reason: 'no-criteria-tagged:prod' },
      ],
      pick: null,
    },
    { kind: 'end', reason: 'nothing-to-check-live' },
  ]);
});

test('it skips a step once when a retry lever carries the instant of the claim', async () => {
  const ctx = await setupTest({ verifyProd: true });
  const item = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('verify') });

  // the seed filed its lever one second before the clock now
  const result = await ctx.claimAt(brandSchemas.instant.parse(ctx.clock.now() - 1000));
  const view = await ctx.readItem(item);

  const received: unknown = [result.skips.length, view.position];

  expect(received).toStrictEqual([1, { kind: 'end', reason: 'nothing-to-check-live' }]);
});

test('it writes no lease, seat or decision for a skip', async () => {
  const ctx = await setupTest({ verifyProd: true });
  const item = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('verify') });

  await ctx.claim();

  const lease = await ctx.store.read((tx) =>
    tx.readLastLeaseGen(item, brandSchemas.phaseName.parse('verify')),
  );

  const decisions = await ctx.listFacts('boxxy.decision.recorded');
  const claimed = await ctx.listFacts('boxxy.attempt.claimed');

  expect([lease, decisions, claimed]).toStrictEqual([0, [], []]);
});

test('it starts a step with a criteria gate on the tagged lines alone', async () => {
  const ctx = await setupTest({ verifyProd: true });

  await ctx.seedItem({
    phase: brandSchemas.phaseName.parse('verify'),
    acceptance: [
      ctx.buildCriterion('a1', 'The settings page renders', ctx.prod),
      ctx.buildCriterion('a2', 'The unit tests pass'),
    ],
  });

  const result = await ctx.claim();

  invariant(result.pick?.kind === 'start', 'the claim starts the verify');

  expect(result.skips).toStrictEqual([]);
  expect(result.pick.spawn.prompt).toContain('- a1: The settings page renders');
  expect(result.pick.spawn.prompt).not.toContain('The unit tests pass');
});

test('it skips several steps of one item in one call', async () => {
  const ctx = await setupTest({
    review: ['      criteria: { tagged: qa }', '      skip: next'],
    verifyProd: true,
  });

  const item = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('review') });
  const result = await ctx.claim();
  const attempts = await ctx.listAttempts(item);
  const view = await ctx.readItem(item);

  const skipped: unknown = result.skips.map((skip) => [skip.phase, skip.reason]);
  const ended: unknown = [attempts.map((attempt) => attempt.phase), view.position];

  expect(skipped).toStrictEqual([
    ['review', 'no-criteria-tagged:qa'],
    ['verify', 'no-criteria-tagged:prod'],
  ]);

  expect(ended).toStrictEqual([
    ['review', 'verify'],
    { kind: 'end', reason: 'nothing-to-check-live' },
  ]);
});

test('it skips a step and picks the next one in the same call', async () => {
  const ctx = await setupTest({ review: ['      criteria: { tagged: qa }', '      skip: next'] });

  await ctx.seedItem({ phase: brandSchemas.phaseName.parse('review') });

  const result = await ctx.claim();

  const received: unknown = [result.skips.length, result.pick?.attempt.phase];

  expect(received).toStrictEqual([1, 'verify']);
});

test.each([
  ['success', 'check-passed:pr / checks', 'verify'],
  ['failure', undefined, 'review'],
] as const)(
  'it reads the check at the pull request head as %s for a skipWhen gate',
  async (state, reason, phase) => {
    const ctx = await setupTest({
      review: ["      skipWhen: [{ checkPassed: 'pr / checks' }]", '      skip: next'],
    });

    const built = await ctx.seedBuildWithPullRequest(ctx.forge, 41);

    const repo = brandSchemas.repoName.parse('example/app');
    const head = brandSchemas.commitSha.parse('c0ffee1'.padEnd(40, '0'));

    ctx.forge.seed({
      ref: { repo, number: 41 },
      githubId: 9_000_041,
      reading: {
        state: 'open',
        mergedAt: null,
        mergeCommit: null,
        commits: [{ sha: head, message: 'add the dark theme' }],
      },
    });

    ctx.forge.seedChecks({ repo, head, checks: { 'pr / checks': state } });

    const result = await ctx.claim();

    const received: unknown = [
      result.skips.map((skip) => skip.reason),
      result.pick?.attempt.phase,
      result.pick?.attempt.item,
    ];

    const skippedReasons = reason === undefined ? [] : [reason];

    expect(received).toStrictEqual([skippedReasons, phase, built.item]);
  },
);

test('it runs a step whose skipWhen check cannot be read', async () => {
  const ctx = await setupTest({
    review: ["      skipWhen: [{ checkPassed: 'pr / checks' }]", '      skip: next'],
  });

  await ctx.seedBuildWithPullRequest(ctx.forge, 41);

  ctx.forge.setDown(true);

  const result = await ctx.claim();

  const received: unknown = [result.skips, result.pick?.attempt.phase];

  expect(received).toStrictEqual([[], 'review']);
});

test('it records no skip while the runner is paused', async () => {
  const ctx = await setupTest({ verifyProd: true });
  const item = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('verify') });

  await ctx.store.exclusive(async (tx) => {
    await tx.writeHeartbeat(ctx.runner, ctx.clock.now());
    await tx.applyChange(buildMockPauseChange(ctx.runner));
  });

  const result = await ctx.claim();
  const attempts = await ctx.listAttempts(item);

  expect([result, attempts]).toStrictEqual([{ skips: [], pick: null }, []]);
});

test('it records no skip for an item of a repo the configuration does not name', async () => {
  const ctx = await setupTest(
    { verifyProd: true },
    { repos: [brandSchemas.repoName.parse('example/other')] },
  );

  const item = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('verify') });
  const result = await ctx.claim();
  const attempts = await ctx.listAttempts(item);

  expect([result, attempts]).toStrictEqual([{ skips: [], pick: null }, []]);
});

test('it derives waiting with the wait reason for an item whose repo ships by release and has no shipped row', async () => {
  const ctx = await setupTest();

  ctx.useShipRules(['  example/app: { ships: { release: {} } }']);

  const item = await ctx.mergeItem(['prod']);
  const view = await ctx.readItem(item);

  expect(view.derived).toStrictEqual({ state: 'waiting', reason: 'wait:shipped' });
});

test('it claims no step and records no skip while the wait says waiting', async () => {
  const ctx = await setupTest();

  ctx.useShipRules(['  example/app: { ships: { release: {} } }']);

  await ctx.mergeItem(['prod']);

  const result = await ctx.claim();

  expect(result).toStrictEqual({ skips: [], pick: null });
});

test('it starts the step once a shipped row names the merge commit', async () => {
  const ctx = await setupTest();

  ctx.useShipRules(['  example/app: { ships: { release: {} } }']);

  const item = await ctx.mergeItem(['prod']);

  await ctx.store.exclusive((tx) =>
    tx.applyChange(
      buildMockShippedChange({
        itemId: item,
        commit: seededMergeCommit,
        rule: 'release',
        ref: 'v1.0.0',
        seenAt: ctx.clock.now(),
      }),
    ),
  );

  const result = await ctx.claim();

  const received: unknown = [result.skips, result.pick?.kind, result.pick?.attempt.phase];

  expect(received).toStrictEqual([[], 'start', 'verify']);
});

test('it does not read a shipped row of an earlier commit as the item having shipped', async () => {
  const ctx = await setupTest();

  ctx.useShipRules(['  example/app: { ships: { release: {} } }']);

  const item = await ctx.mergeItem(['prod']);

  const earlier = buildMockShippedChange({
    itemId: item,
    commit: brandSchemas.commitSha.parse('d1'.repeat(20)),
    rule: 'release',
    ref: 'v0.9.0',
    seenAt: ctx.clock.now(),
  });

  await ctx.store.exclusive((tx) => tx.applyChange(earlier));

  const view = await ctx.readItem(item);

  expect(view.derived).toStrictEqual({ state: 'waiting', reason: 'wait:shipped' });
});

test('it skips the step with the wait-skip reason, and writes a notice, for a repo that ships nothing', async () => {
  const ctx = await setupTest();

  ctx.useShipRules(['  example/other: { ships: none }']);

  const item = await ctx.mergeItem(['prod']);
  const result: unknown = await ctx.claim();
  const view = await ctx.readItem(item);
  const attempts = await ctx.listAttempts(item);
  const notices = await ctx.listNotices();

  expect(result).toStrictEqual({
    skips: [{ kind: 'skipped', itemId: item, phase: 'verify', reason: 'wait-skip:shipped' }],
    pick: null,
  });

  expect(view.position).toStrictEqual({ kind: 'end', reason: 'merged' });
  expect(attempts.at(-1)?.skipReason).toBe('wait-skip:shipped');

  const rows: unknown = notices.map((row) => [row.kind, row.item, row.phase, row.reason]);

  expect(rows).toStrictEqual([['notify', item, 'verify', 'wait-skip:shipped']]);
});

test('it skips on the criteria gate before the wait, with no notice, when no line carries the tag', async () => {
  const ctx = await setupTest();

  ctx.useShipRules(['  example/app: { ships: { release: {} } }']);

  const item = await ctx.mergeItem([]);
  const result: unknown = await ctx.claim();
  const notices = await ctx.listNotices();

  expect(result).toStrictEqual({
    skips: [{ kind: 'skipped', itemId: item, phase: 'verify', reason: 'no-criteria-tagged:prod' }],
    pick: null,
  });

  expect(notices).toStrictEqual([]);
});
