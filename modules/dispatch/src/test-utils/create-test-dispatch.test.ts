import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { createFakeForge } from './create-fake-forge.ts';
import { createMemoryClaimStore } from './create-memory-claim-store.ts';
import { createTestDispatch } from './create-test-dispatch.ts';

test('it claims and starts an item seeded at a phase in one tick', async () => {
  const dispatch = await createTestDispatch();
  const item = await dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  await dispatch.tick();

  const [attempt] = await dispatch.store.read((tx) => tx.listItemAttempts(item));

  const received: unknown = [attempt?.phase, attempt?.state];

  expect(received).toStrictEqual(['build', 'running']);
});

test('it seeds into the store it is given', async () => {
  const store = createMemoryClaimStore();

  const dispatch = await createTestDispatch({ store });
  const item = await dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const row = await store.read((tx) => tx.readItem(item, dispatch.clock.now(), dispatch.rules()));

  expect(row?.id).toBe(item);
});

test('it seeds an item with no phase at the first phase of its pipeline', async () => {
  const dispatch = await createTestDispatch();
  const item = await dispatch.seedItem({});

  await dispatch.tick();

  const [attempt] = await dispatch.store.read((tx) => tx.listItemAttempts(item));

  const phase: unknown = attempt?.phase;

  expect(phase).toBe('triage');
});

test('it carries on the store, the clock and the IDs of the dispatch it restarts', async () => {
  const first = await createTestDispatch();
  const item = await first.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const restarted = await createTestDispatch({ restartOf: first });
  const next = await restarted.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  const row = await restarted.store.read((tx) =>
    tx.readItem(item, restarted.clock.now(), restarted.rules()),
  );

  expect([row?.id, next === item, restarted.clock.now()]).toStrictEqual([
    item,
    false,
    first.clock.now(),
  ]);
});

test('#seedBuildWithPullRequest settles a build built, whose review then reviews the pull request', async () => {
  const dispatch = await createTestDispatch();

  const forge = createFakeForge();

  const build = await dispatch.seedBuildWithPullRequest(forge, 7);
  const claim = await dispatch.claim();

  invariant(claim !== null, 'the review of the item is claimed');

  const review = await dispatch.readAttempt(claim.attempt.id);

  const received: unknown = [build.state, build.outcome, review.phase, review.input];

  expect(received).toStrictEqual([
    'succeeded',
    'built',
    'review',
    expect.objectContaining({ pullRequest: { repo: 'example/app', number: 7 } }),
  ]);
});

test('#closeAndSettle records the close-out and settles the attempt from it', async () => {
  const dispatch = await createTestDispatch();
  const item = await dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const claim = await dispatch.claim();

  invariant(claim?.attempt.item === item, 'the claim picks the seeded item');

  const attempt = await dispatch.readAttempt(claim.attempt.id);

  await dispatch.closeAndSettle(attempt, {
    result: { kind: 'abandoned', reason: 'The upload service is down' },
    criteria: [],
    openItems: [],
    friction: [],
  });

  const settled = await dispatch.readAttempt(claim.attempt.id);

  const received: unknown = [settled.state, settled.outcome];

  expect(received).toStrictEqual(['failed', 'abandoned']);
});

test('#seedReworkAfter starts the second build on the first build session', async () => {
  const dispatch = await createTestDispatch();
  const first = await dispatch.seedBuild();
  const second = await dispatch.seedReworkAfter(first);

  const received: unknown = [second.phase, second.state, second.atcSession, second.caller];

  expect(received).toStrictEqual(['build', 'running', first.atcSession, first.caller]);
});
