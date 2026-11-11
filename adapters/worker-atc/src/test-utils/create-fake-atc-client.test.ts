import { expect, test } from 'bun:test';
import { createFakeClock } from '@boxxy/dispatch/test-utils/create-fake-clock';
import { FakeAtcError, createFakeAtcClient } from './create-fake-atc-client.ts';

function setupTest() {
  const clock = createFakeClock();

  return {
    clock,
    atc: createFakeAtcClient({ clock, targets: { box: 'suspending', laptop: 'local' } }),
  };
}

test('#spawn answers the first session again for a second spawn with the same key', async () => {
  const ctx = setupTest();

  const first = await ctx.atc.session.spawn({ target: 'box', idempotencyKey: 'key-1' });
  const second = await ctx.atc.session.spawn({ target: 'box', idempotencyKey: 'key-1' });

  expect(second.session.id).toBe(first.session.id);
});

test('#spawn refuses a target it does not have', () => {
  const ctx = setupTest();

  expect(ctx.atc.session.spawn({ target: 'elsewhere' })).rejects.toMatchObject({
    code: 'unknown_target',
  });
});

test.each([
  ['box', 'suspended', 'sleep'],
  ['laptop', 'exited', 'stop'],
] as const)('#kill on the target %s leaves the harness %s', async (target, harness, desired) => {
  const ctx = setupTest();

  const spawned = await ctx.atc.session.spawn({ target });

  await ctx.atc.session.kill({ session: spawned.session.id, stopOnly: true });

  const read = await ctx.atc.session.get({ session: spawned.session.id });

  expect([
    read.session.state,
    read.session.lifecycle.harness,
    read.session.lifecycle.desired,
  ]).toStrictEqual(['exited', harness, desired]);
});

test('#kill with no stop-only flag forgets a session that already exited', async () => {
  const ctx = setupTest();

  const spawned = await ctx.atc.session.spawn({ target: 'laptop' });

  await ctx.atc.session.kill({ session: spawned.session.id });
  await ctx.atc.session.kill({ session: spawned.session.id });

  expect(ctx.atc.session.get({ session: spawned.session.id })).rejects.toMatchObject({
    code: 'no_such_session',
  });
});

test('#adopt refuses a session that runs with the code of an unknown session', async () => {
  const ctx = setupTest();

  const spawned = await ctx.atc.session.spawn({ target: 'box' });

  expect(ctx.atc.session.adopt({ session: spawned.session.id })).rejects.toMatchObject({
    code: 'no_such_session',
  });
});

test('#forget answers a confirm token first on a target that destroys its hosts', async () => {
  const ctx = setupTest();

  const spawned = await ctx.atc.session.spawn({ target: 'box' });

  await ctx.atc.session.kill({ session: spawned.session.id, stopOnly: true });

  const answer = await ctx.atc.session.forget({ session: spawned.session.id });

  expect(answer).toStrictEqual({
    confirmToken: `confirm-${spawned.session.id}`,
    expiresAt: 1_060_000,
  });
});

test('#message refuses a session whose process does not run', async () => {
  const ctx = setupTest();

  const spawned = await ctx.atc.session.spawn({ target: 'laptop' });

  await ctx.atc.session.kill({ session: spawned.session.id, stopOnly: true });

  expect(
    ctx.atc.session.message({ session: spawned.session.id, text: 'hello' }),
  ).rejects.toMatchObject({
    code: 'session_dead',
  });
});

test('#failNext rejects the next call of the procedure once', async () => {
  const ctx = setupTest();

  ctx.atc.failNext('list', new FakeAtcError('internal'));

  const first = await Promise.allSettled([ctx.atc.session.list({})]);
  const second = await ctx.atc.session.list({});

  expect([first[0]?.status, second]).toStrictEqual(['rejected', { sessions: [] }]);
});

test('#patchSession changes the times that a read of the session gives', async () => {
  const ctx = setupTest();

  const spawned = await ctx.atc.session.spawn({ target: 'box' });

  ctx.atc.patchSession(spawned.session.id, {
    lastActivityAt: 1_500_000,
    lastAttachedAt: 1_400_000,
  });

  const read = await ctx.atc.session.get({ session: spawned.session.id });

  expect([read.lastActivityAt, read.session.lastAttachedAt]).toStrictEqual([1_500_000, 1_400_000]);
});
