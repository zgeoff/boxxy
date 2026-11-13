import { expect, test } from 'bun:test';
import type { ItemId } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import invariant from 'tiny-invariant';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { loadVerifyRules } from '../test-utils/load-verify-rules.ts';
import { claimNext } from './claim-next.ts';
import { requestWake } from './request-wake.ts';
import type { SpawnSettings } from './types.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  return {
    ...dispatch,
    claimNext: () =>
      claimNext({
        store: dispatch.store,
        runner: dispatch.runner,
        rules: dispatch.rules(),
        now: dispatch.clock.now(),
        newId: dispatch.newId,
        backoff: dispatch.backoff,
        spawn: dispatch.spawn,
      }),
    claimNextWithRepos: (repos: SpawnSettings['repos']) =>
      claimNext({
        store: dispatch.store,
        runner: dispatch.runner,
        rules: dispatch.rules(),
        now: dispatch.clock.now(),
        newId: dispatch.newId,
        backoff: dispatch.backoff,
        spawn: { ...dispatch.spawn, repos },
      }),
    claimNextAfter: (claimed: readonly ItemId[]) =>
      claimNext({
        store: dispatch.store,
        runner: dispatch.runner,
        rules: dispatch.rules(),
        now: dispatch.clock.now(),
        newId: dispatch.newId,
        backoff: dispatch.backoff,
        spawn: dispatch.spawn,
        claimed: new Set(claimed),
      }),
  };
}

test('it gives no claim when no item is ready', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimNext();

  expect(claim).toBeNull();
});

test('it claims a ready item with a spawn request that names the new attempt', async () => {
  const ctx = await setupTest();
  const item = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const claim = await ctx.claimNext();

  invariant(claim?.kind === 'start', 'the claim starts the item');

  const received: unknown = [claim.attempt.item, claim.attempt.state, claim.attempt.phase];

  expect(received).toStrictEqual([item, 'starting', 'build']);

  expect(claim.spawn).toMatchObject({
    target: 'worker-host',
    cwd: '/tmp/boxxy-test/app',
    name: `boxxy/${claim.attempt.id}`,
    idempotencyKey: claim.attempt.id,
  });

  expect(claim.spawn.prompt).toContain('Add a dark theme');
});

test('it claims an item of a repo with a git source with that source and no folder', async () => {
  const ctx = await setupTest();

  await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  const source = { url: 'https://git.example.test/example/app.git', ref: 'main' };

  const claim = await ctx.claimNextWithRepos(
    new Map([...ctx.spawn.repos.keys()].map((repo) => [repo, source])),
  );

  invariant(claim?.kind === 'start', 'the claim starts the item');

  expect([claim.spawn, 'cwd' in claim.spawn]).toStrictEqual([
    expect.objectContaining({ source }),
    false,
  ]);
});

test('it gives no claim of a ready item whose repo the configuration does not name', async () => {
  const ctx = await setupTest();

  await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  const claim = await ctx.claimNextWithRepos(
    new Map([[brandSchemas.repoName.parse('example/widget'), '/tmp/boxxy-test/widget']]),
  );

  expect(claim).toBeNull();
});

test('it takes the seats of every limit that counts the pick', async () => {
  const ctx = await setupTest();

  await ctx.seedItem({ phase: brandSchemas.phaseName.parse('design'), designMode: 'attended' });

  const claim = await ctx.claimNext();

  invariant(claim !== null, 'the claim picks the item');

  const seats = await ctx.heldSeats(claim.attempt.id);

  expect([claim.attempt.mode, seats]).toStrictEqual(['attended', ['owner-design', 'workers']]);
});

test('it gives no pick in a pool that the backoff holds', async () => {
  const ctx = await setupTest();

  await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  ctx.backoff.hold(
    brandSchemas.poolName.parse('build'),
    brandSchemas.instant.parse(ctx.clock.now() + 60_000),
  );

  const claim = await ctx.claimNext();

  expect(claim).toBeNull();
});

test('it gives no start pick of an item that the tick claimed already', async () => {
  const ctx = await setupTest();
  const item = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const claim = await ctx.claimNextAfter([item]);

  expect(claim).toBeNull();
});

test('it gives no wake pick of an item that the tick claimed already', async () => {
  const ctx = await setupTest();

  const item = await ctx.seedItem({
    phase: brandSchemas.phaseName.parse('design'),
    designMode: 'attended',
  });

  const started = await ctx.claim();

  invariant(started !== null, 'the claim starts the seeded item');

  ctx.worker.setSession(started.attempt.id, { state: 'suspended', asked: true });

  await ctx.tick();

  await requestWake({
    store: ctx.store,
    attempt: started.attempt.id,
    by: 'command',
    actor: 'boxxy:owner:local',
    now: ctx.clock.now(),
    newId: ctx.newId,
  });

  const claim = await ctx.claimNextAfter([item]);

  expect(claim).toBeNull();
});

test('it carries the open counts and the answer hint of the review in the prompt of a rework round', async () => {
  const ctx = await setupTest();
  const rework = await ctx.seedRework({});

  expect(rework.claimed.spawnRequest).toMatchObject({
    prompt: expect.stringMatching(
      /## Findings to answer\n\nThe review at [0-9a-f]{40} left findings open: high 1, medium 0, low 0\.\n\nReply to each open finding with a disposition\./u,
    ),
  });
});

test('it carries the failed features of the verify in the prompt of the rework build', async () => {
  const ctx = await setupTest();

  ctx.setRules(loadVerifyRules({ session: 'fresh', resume: false }));

  await ctx.seedBuild();

  const review = await ctx.claim();

  invariant(review !== null, 'the review claims');

  const reviewRow = await ctx.readAttempt(review.attempt.id);

  await ctx.closeAndSettle(reviewRow, {
    round: 1,
    cause: 'first',
    reading: buildMockGateReading({ status: 'passed' }),
    unrelatedLines: null,
  });

  const verify = await ctx.claim();

  invariant(verify !== null, 'the verify claims');

  const verifyRow = await ctx.readAttempt(verify.attempt.id);

  await ctx.closeAndSettle(verifyRow, {
    result: { kind: 'failed', features: ['upload-retry'] },
    friction: [],
  });

  const rework = await ctx.claimNext();

  invariant(rework !== null, 'the rework build claims');

  const row = await ctx.readAttempt(rework.attempt.id);

  expect(row.spawnRequest).toMatchObject({
    prompt: expect.stringMatching(
      /## Findings to answer\n\nThe verify at [0-9a-f]{40} failed these features:\n\n- upload-retry/u,
    ),
  });
});

test('it carries the item body and the owner notes in the prompt of a claim', async () => {
  const ctx = await setupTest();
  const item = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  await ctx.store.exclusive((tx) =>
    tx.applyChange({
      at: ctx.clock.now(),
      writes: [
        {
          op: 'update',
          table: 'items',
          key: { id: item },
          expect: {},
          set: { body: '## Scope\n\nOnly the theme.' },
        },
        {
          op: 'insert',
          table: 'notes',
          row: {
            item,
            seq: 1,
            text: 'Use the media query.',
            by: 'boxxy:owner:local',
            at: brandSchemas.instant.parse(0),
          },
        },
      ],
      facts: [],
    }),
  );

  const claim = await ctx.claimNext();

  invariant(claim?.kind === 'start', 'the claim starts the item');

  expect(claim.spawn.prompt).toContain(
    'The app follows the system theme.\n\n## Scope\n\nOnly the theme.\n\n## Acceptance',
  );

  expect(claim.spawn.prompt).toContain(
    '## Notes from the owner\n\n- 1970-01-01: Use the media query.',
  );
});
