import { expect, test } from 'bun:test';
import { buildMockNoslopReport } from '@boxxy/closeout/test-utils/build-mock-noslop-report';
import type { AttemptRow, ItemId } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockPhaseKind } from '@boxxy/model/test-utils/build-mock-phase-kind';
import invariant from 'tiny-invariant';
import { claimNext } from '../claims/claim-next.ts';
import { requestWake } from '../claims/request-wake.ts';
import { resumeClaim } from '../claims/resume-claim.ts';
import { closeOutAttempt } from '../closeouts/close-out-attempt.ts';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { actOnReading } from './act-on-reading.ts';
import { pickReadingAction } from './pick-reading-action.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  const claimAt = async (phase: string, designMode: 'agent' | 'attended') => {
    const item = await dispatch.seedItem({
      phase: brandSchemas.phaseName.parse(phase),
      designMode,
    });

    const claim = await dispatch.claim();

    invariant(claim?.attempt.item === item, `the claim picks the seeded ${phase} item`);

    return dispatch.readAttempt(claim.attempt.id);
  };

  return {
    ...dispatch,
    agentSession: (name: string) => brandSchemas.agentSessionId.parse(name),
    claimAttended: () => claimAt('design', 'attended'),
    claimAgent: () => claimAt('build', 'agent'),
    claimReview: () => claimAt('review', 'agent'),
    closeOut: (attempt: AttemptRow, body: unknown) =>
      closeOutAttempt({
        store: dispatch.store,
        call: dispatch.buildCallRef(attempt),
        body,
        rules: dispatch.rules(),
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
    wake: async (item: ItemId) => {
      const attempts = await dispatch.store.read((tx) => tx.listItemAttempts(item));

      const asleep = attempts.find((attempt) => attempt.state === 'sleeping');

      invariant(asleep !== undefined, 'the item has a sleeping attempt');

      return requestWake({
        store: dispatch.store,
        attempt: asleep.id,
        by: 'command',
        actor: 'boxxy:owner:local',
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      });
    },
    readItem: async (item: ItemId) => {
      const view = await dispatch.store.read((tx) =>
        tx.readItem(item, dispatch.clock.now(), dispatch.rules()),
      );

      invariant(view !== null, 'the item is stored');

      return view;
    },
  };
}

test.each([
  ['1 hour away, until the reset', 60, 60],
  ['48 hours away, for 24 hours at most', 48 * 60, 24 * 60],
  ['that is unknown, for 24 hours', 0, 24 * 60],
])(
  'it closes a session at the usage limit and holds its pool back, with a reset %s',
  async (_title, resetMinutes, heldMinutes) => {
    const ctx = await setupTest();
    const attempt = await ctx.claimAgent();

    const now = ctx.clock.now();

    ctx.worker.setSession(attempt.id, {
      state: 'running',
      attention: 'working',
      lastActivityAt: now,
      usageLimitResetsAt: brandSchemas.instant.parse(now + resetMinutes * 60_000),
    });

    await ctx.tick();

    const after = await ctx.readAttempt(attempt.id);

    const before = brandSchemas.instant.parse(now + heldMinutes * 60_000 - 1);
    const atEnd = brandSchemas.instant.parse(now + heldMinutes * 60_000);

    const held = [
      ctx.backoff.listHeld(before).includes(attempt.pool),
      ctx.backoff.listHeld(atEnd).includes(attempt.pool),
    ];

    expect([after.state, after.closing]).toStrictEqual(['closing', 'usage-limit']);
    expect(held).toStrictEqual([true, false]);
  },
);

test('it does not settle an attended session whose turn ended with no close-out', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAttended();

  ctx.worker.setSession(attempt.id, {
    state: 'running',
    attention: 'turn-ended',
    lastActivityAt: ctx.clock.now(),
    agentSession: ctx.agentSession('agent-session-1'),
  });

  await ctx.tick();

  const after = await ctx.readAttempt(attempt.id);

  expect(after.state).toBe('running');
});

test('it keeps the seats of a closed-out attempt until its session stops', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAttended();

  ctx.worker.setSession(attempt.id, {
    state: 'running',
    attention: 'turn-ended',
    lastActivityAt: ctx.clock.now(),
    agentSession: ctx.agentSession('agent-session-1'),
  });

  await ctx.closeOut(attempt, {
    result: { kind: 'designed', design: { summary: 'Follow the system theme.', location: null } },
    friction: [],
  });

  const closing = await ctx.readAttempt(attempt.id);
  const closingSeats = await ctx.heldSeats(attempt.id);

  await ctx.tick();
  await ctx.tick();

  const settled = await ctx.readAttempt(attempt.id);
  const settledSeats = await ctx.heldSeats(attempt.id);

  expect([
    [closing.state, closingSeats],
    [settled.state, settledSeats],
  ]).toStrictEqual([
    ['closing', ['owner-design', 'workers']],
    ['succeeded', []],
  ]);
});

test('it settles a closing attempt whose session does not stop, and frees its seats', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAttended();

  await ctx.closeOut(attempt, {
    result: { kind: 'designed', design: { summary: 'Follow the system theme.', location: null } },
    friction: [],
  });

  ctx.worker.failAlways('stop', { kind: 'unknown', reason: 'host_leased' });
  ctx.clock.advance(10 * 60_000 + 1);

  await ctx.tick();

  const settled = await ctx.readAttempt(attempt.id);
  const seats = await ctx.heldSeats(attempt.id);

  expect([settled.state, settled.failure, settled.strayedAt !== null]).toStrictEqual([
    'succeeded',
    null,
    true,
  ]);

  expect(seats).toStrictEqual([]);
});

test('it sleeps a waiting attended session and wakes it with the same atc session', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAttended();

  ctx.worker.setSession(attempt.id, {
    state: 'running',
    attention: 'turn-ended',
    lastActivityAt: ctx.clock.now(),
    agentSession: ctx.agentSession('agent-session-1'),
  });

  ctx.clock.advance(31 * 60_000);

  await ctx.tick();

  const asleepRow = await ctx.readAttempt(attempt.id);

  const asleep = [asleepRow.state, await ctx.heldSeats(attempt.id)];

  await ctx.wake(attempt.item);
  await ctx.tick();

  const woken = await ctx.readAttempt(attempt.id);

  expect([asleep, [woken.state, await ctx.heldSeats(attempt.id), woken.atcSession]]).toStrictEqual([
    ['sleeping', []],
    ['running', ['owner-design', 'workers'], attempt.atcSession],
  ]);
});

test('it sleeps an attended session that reads working with no activity for the quiet time', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAttended();

  ctx.worker.setSession(attempt.id, {
    state: 'running',
    attention: 'working',
    lastActivityAt: ctx.clock.now(),
    agentSession: ctx.agentSession('agent-session-1'),
  });

  ctx.clock.advance(61 * 60_000);

  await ctx.tick();

  const after = await ctx.readAttempt(attempt.id);

  expect([after.state, await ctx.heldSeats(attempt.id)]).toStrictEqual(['sleeping', []]);
});

test('it settles the sleeping attempt of an item that the owner closes, with no wake', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAttended();

  ctx.worker.setSession(attempt.id, {
    state: 'running',
    attention: 'turn-ended',
    lastActivityAt: ctx.clock.now(),
    agentSession: ctx.agentSession('agent-session-1'),
  });

  ctx.clock.advance(31 * 60_000);

  await ctx.tick();
  await ctx.closeItem(attempt.item, 'no longer wanted');

  const settled = await ctx.readAttempt(attempt.id);

  expect([settled.state, settled.failure, settled.outcome]).toStrictEqual([
    'failed',
    'item-closed',
    'lost',
  ]);

  expect(ctx.worker.calls.map((call) => call.method)).not.toContain('resume');
});

test('it settles a closing attempt as failed when the phase kind can no longer settle its close-out', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimReview();

  const rules = ctx.rules();

  await ctx.closeOut(attempt, {
    verdict: { kind: 'passed' },
    noslop: buildMockNoslopReport(),
    friction: [],
  });

  ctx.setRules({
    ...rules,
    phases: new Map([
      ...rules.phases,
      [
        brandSchemas.phaseName.parse('review'),
        {
          ...buildMockPhaseKind({ name: 'review', outcomes: ['passed', 'changes-requested'] }),
          settle: () => {
            throw new Error('verdict.kind is not known');
          },
        },
      ],
    ]),
  });

  ctx.worker.setSession(attempt.id, { state: 'suspended', asked: true, agentSession: null });

  await ctx.tick();

  const settled = await ctx.readAttempt(attempt.id);
  const item = await ctx.readItem(attempt.item);
  const seats = await ctx.heldSeats(attempt.id);

  expect([settled.state, settled.failure, settled.outcome, settled.returnedOutcome]).toStrictEqual([
    'failed',
    'closeout-unsettleable',
    'unsettleable',
    null,
  ]);

  expect(seats).toStrictEqual([]);
  expect(item.position).toMatchObject({ kind: 'hold', reason: 'outcome not in rules' });
});

test('it stops a session that appears after its item closed while the spawn was in flight', async () => {
  const ctx = await setupTest();

  ctx.worker.failNext('start', { kind: 'unknown', reason: 'socket closed' });

  const attempt = await ctx.claimAgent();

  await ctx.closeItem(attempt.item, 'no longer wanted');

  ctx.worker.setSession(attempt.id, { state: 'absent' });

  await ctx.tick();

  const waitingRow = await ctx.readAttempt(attempt.id);

  const waiting = waitingRow.state;

  ctx.worker.setSession(attempt.id, {
    state: 'running',
    attention: 'working',
    lastActivityAt: brandSchemas.instant.parse(0),
    lastOwnerAt: brandSchemas.instant.parse(0),
    agentSession: null,
  });

  await ctx.tick();
  await ctx.tick();

  const settled = await ctx.readAttempt(attempt.id);

  expect([waiting, settled.state, settled.failure]).toStrictEqual([
    'closing',
    'failed',
    'item-closed',
  ]);

  expect(ctx.worker.calls.map((call) => call.method)).toContain('stop');
});

test('it sleeps an attended session whose agent stays active and whose owner is gone', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAttended();

  ctx.clock.advance(241 * 60_000);

  ctx.worker.setSession(attempt.id, {
    state: 'running',
    attention: 'working',
    lastActivityAt: brandSchemas.instant.parse(ctx.clock.now() - 60_000),
    lastOwnerAt: attempt.claimedAt,
    agentSession: ctx.agentSession('agent-session-1'),
  });

  await ctx.tick();

  const after = await ctx.readAttempt(attempt.id);

  expect([after.state, await ctx.heldSeats(attempt.id)]).toStrictEqual(['sleeping', []]);
});

test('it ends the tick and reads every live attempt when the host refuses a wake for capacity', async () => {
  const ctx = await setupTest();
  const asleep = await ctx.claimAttended();

  ctx.worker.setSession(asleep.id, {
    state: 'running',
    attention: 'turn-ended',
    lastActivityAt: ctx.clock.now(),
    agentSession: ctx.agentSession('agent-session-1'),
  });

  ctx.clock.advance(31 * 60_000);

  await ctx.tick();

  const other = await ctx.claimAgent();

  ctx.worker.setSession(other.id, {
    state: 'ended',
    agentSession: ctx.agentSession('agent-session-2'),
  });

  ctx.worker.failAlways('resume', {
    kind: 'refused',
    cause: 'capacity',
    reason: 'no free imp slot',
  });

  await ctx.wake(asleep.item);
  await ctx.tick();

  const firstTries = ctx.worker.calls.filter((call) => call.method === 'resume').length;

  const after = await ctx.readAttempt(asleep.id);
  const otherAfter = await ctx.readAttempt(other.id);
  const woken = await ctx.listFacts('boxxy.attempt.woken');

  await ctx.tick();

  const secondTries = ctx.worker.calls.filter((call) => call.method === 'resume').length;

  expect([
    firstTries,
    after.state,
    after.wakeRequestedAt !== null,
    otherAfter.state,
    woken.length,
    secondTries,
  ]).toStrictEqual([1, 'sleeping', true, 'failed', 1, 1]);
});

test('it discards a settle that the table picked before the session resumed', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAttended();

  ctx.worker.setSession(attempt.id, { state: 'suspended', asked: true });

  await ctx.tick();
  await ctx.wake(attempt.item);

  const claim = await claimNext({
    store: ctx.store,
    runner: ctx.runner,
    rules: ctx.rules(),
    now: ctx.clock.now(),
    newId: ctx.newId,
    backoff: ctx.backoff,
    spawn: ctx.spawn,
  });

  invariant(claim?.kind === 'wake', 'the claim wakes the attempt');

  ctx.clock.advance(10 * 60_000);

  const input = {
    store: ctx.store,
    worker: ctx.worker,
    rules: ctx.rules(),
    backoff: ctx.backoff,
    attempt: claim.attempt,
    reading: await ctx.worker.reconcile(claim.attempt),
    now: ctx.clock.now(),
    newId: ctx.newId,
  };

  const action = pickReadingAction({ ...input, step: null, sleep: ctx.rules().sleep });

  await resumeClaim({ ...input, claim });
  await actOnReading({ ...input, action });

  const after = await ctx.readAttempt(attempt.id);

  expect([action.kind, after.state]).toStrictEqual(['settle', 'running']);
});

test('it discards a sleep that the table picked before the attempt slept, woke and resumed', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimAttended();

  invariant(attempt.atcSession !== null, 'the claim started a session');

  const reading = {
    kind: 'suspended',
    atcSession: attempt.atcSession,
    agentSession: null,
    asked: false,
  } as const;

  const action = pickReadingAction({
    attempt,
    reading,
    step: null,
    sleep: ctx.rules().sleep,
    now: ctx.clock.now(),
  });

  ctx.worker.setSession(attempt.id, { state: 'suspended', asked: true });

  await ctx.tick();
  await ctx.wake(attempt.item);
  await ctx.claim();

  await actOnReading({
    store: ctx.store,
    worker: ctx.worker,
    rules: ctx.rules(),
    backoff: ctx.backoff,
    attempt,
    reading,
    action,
    now: ctx.clock.now(),
    newId: ctx.newId,
  });

  const after = await ctx.readAttempt(attempt.id);

  expect([action.kind, after.state]).toStrictEqual(['sleep', 'running']);
});

test('it sends no second spawn for a respawn that the table picked before the start landed', async () => {
  const ctx = await setupTest();

  await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  const claim = await ctx.claim();

  invariant(claim?.kind === 'start', 'the claim starts an attempt');

  const reading = { kind: 'absent' } as const;
  const now = ctx.clock.now();

  const action = pickReadingAction({
    attempt: claim.attempt,
    reading,
    step: null,
    sleep: ctx.rules().sleep,
    now,
  });

  await actOnReading({
    store: ctx.store,
    worker: ctx.worker,
    rules: ctx.rules(),
    backoff: ctx.backoff,
    attempt: claim.attempt,
    reading,
    action,
    now,
    newId: ctx.newId,
  });

  const starts = ctx.worker.calls.filter((call) => call.method === 'start');

  expect([action.kind, starts.length]).toStrictEqual(['respawn', 1]);
});

test('it returns a respawn that the worker refused, with its reason', async () => {
  const ctx = await setupTest();
  const item = await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  const claim = await claimNext({
    store: ctx.store,
    runner: ctx.runner,
    rules: ctx.rules(),
    now: ctx.clock.now(),
    newId: ctx.newId,
    backoff: ctx.backoff,
    spawn: ctx.spawn,
  });

  invariant(claim?.kind === 'start', 'the claim starts the seeded item');

  ctx.worker.failNext('start', {
    kind: 'refused',
    cause: 'other',
    reason: 'clone_failed: the source needs a credential',
  });

  const reading = { kind: 'absent' } as const;
  const now = ctx.clock.now();

  const faults = await actOnReading({
    store: ctx.store,
    worker: ctx.worker,
    rules: ctx.rules(),
    backoff: ctx.backoff,
    attempt: claim.attempt,
    reading,
    action: { kind: 'respawn' },
    now,
    newId: ctx.newId,
  });

  expect(faults).toStrictEqual([
    {
      kind: 'fault',
      fault: 'spawn-refused',
      attempt: claim.attempt.id,
      item,
      cause: 'other',
      reason: 'clone_failed: the source needs a credential',
    },
  ]);
});
