import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { claimNext } from './claim-next.ts';
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
