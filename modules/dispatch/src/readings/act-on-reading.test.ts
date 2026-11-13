import { expect, test } from 'bun:test';
import type { AttemptRow, ItemId, SpawnRequest, WorkerKind } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import { buildMockPhaseKind } from '@boxxy/model/test-utils/build-mock-phase-kind';
import invariant from 'tiny-invariant';
import { claimNext } from '../claims/claim-next.ts';
import { requestWake } from '../claims/request-wake.ts';
import { resumeClaim } from '../claims/resume-claim.ts';
import { closeOutAttempt } from '../closeouts/close-out-attempt.ts';
import { forgetSessions } from '../sessions/forget-sessions.ts';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { loadVerifyRules } from '../test-utils/load-verify-rules.ts';
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

    // the item's review claims, passes and settles
    passReview: async () => {
      const claim = await dispatch.claim();

      invariant(claim !== null, 'the review claims');

      const review = await dispatch.readAttempt(claim.attempt.id);

      await dispatch.closeAndSettle(review, {
        round: 1,
        cause: 'first',
        reading: buildMockGateReading({ status: 'passed' }),
        unrelatedLines: null,
      });
    },

    // a claim whose start got no reply, so its attempt stays starting
    claimStarting: async () => {
      const claim = await dispatch.claim();

      invariant(claim !== null, 'the item claims');

      return dispatch.readAttempt(claim.attempt.id);
    },

    // the host shows the attempt's session running, and the runner reconciles it
    reconcileRunning: async (attempt: AttemptRow) => {
      dispatch.worker.setSession(attempt.id, { state: 'running' });

      await actOnReading({
        store: dispatch.store,
        worker: dispatch.worker,
        rules: dispatch.rules(),
        backoff: dispatch.backoff,
        attempt,
        reading: await dispatch.worker.reconcile(attempt),
        action: { kind: 'move-to-running', via: 'reconcile' },
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      });
    },
    listReconciled: async () => {
      const facts = await dispatch.listFacts('boxxy.attempt.reconciled');

      return facts.map((fact) => fact.payload);
    },
    forgetSessions: () =>
      forgetSessions({
        store: dispatch.store,
        worker: dispatch.worker,
        rules: dispatch.rules(),
        actor: `boxxy:runner:${dispatch.runner}`,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
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
    round: 1,
    cause: 'first',
    reading: buildMockGateReading({ status: 'passed' }),
    unrelatedLines: null,
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
            throw new Error('reading.status is not known');
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

test('it respawns with the git source and the key that the claim stored', async () => {
  const ctx = await setupTest();

  await ctx.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  const repo = brandSchemas.repoName.parse('example/app');
  const source = { url: 'https://git.example.test/example/app.git', ref: 'main' };

  const claim = await claimNext({
    store: ctx.store,
    runner: ctx.runner,
    rules: ctx.rules(),
    now: ctx.clock.now(),
    newId: ctx.newId,
    backoff: ctx.backoff,
    spawn: { ...ctx.spawn, repos: new Map([[repo, source]]) },
  });

  invariant(claim?.kind === 'start', 'the claim starts the seeded item');

  const sent: SpawnRequest[] = [];

  const worker: WorkerKind = {
    ...ctx.worker,
    start: (request) => {
      sent.push(request);

      return ctx.worker.start(request);
    },
  };

  await actOnReading({
    store: ctx.store,
    worker,
    rules: ctx.rules(),
    backoff: ctx.backoff,
    attempt: claim.attempt,
    reading: { kind: 'absent' },
    action: { kind: 'respawn' },
    now: ctx.clock.now(),
    newId: ctx.newId,
  });

  expect(sent).toStrictEqual([
    expect.objectContaining({
      source,
      idempotencyKey: claim.attempt.id,
      name: `boxxy/${claim.attempt.id}`,
    }),
  ]);
});

test('it wakes the kept session again, with no fresh spawn, after the reply to its wake is lost', async () => {
  const ctx = await setupTest();
  const first = await ctx.seedBuild();

  ctx.worker.failNext('resumeKept', { kind: 'unknown', reason: 'the reply did not arrive' });

  const second = await ctx.seedReworkAfter(first);

  ctx.worker.setSession(first.id, { state: 'running' });

  await ctx.tick();

  const after = await ctx.readAttempt(second.id);

  const starts = ctx.worker.calls.filter(
    (call) => call.method === 'start' && call.subject === second.id,
  );

  expect([second.state, after.state, after.atcSession, starts]).toStrictEqual([
    'reconciling',
    'running',
    first.atcSession,
    [],
  ]);
});

test('it clears the kept session and hands its agent session to the rework when it reconciles a wake whose reply was lost', async () => {
  const ctx = await setupTest();
  const first = await ctx.seedBuild();

  ctx.worker.failNext('resumeKept', { kind: 'unknown', reason: 'the reply did not arrive' });

  const second = await ctx.seedReworkAfter(first);

  ctx.worker.setSession(first.id, { state: 'running' });

  const reading = await ctx.worker.reconcile(first);

  invariant(reading.kind === 'running' && reading.agentSession !== null, 'the kept session runs');

  const agentSession = reading.agentSession;

  const holder = await ctx.store.read((tx) => tx.findAttemptByAgentSession(agentSession));

  invariant(holder === first.id, 'the first build holds the agent session');

  const faults = await actOnReading({
    store: ctx.store,
    worker: ctx.worker,
    rules: ctx.rules(),
    backoff: ctx.backoff,
    attempt: second,
    reading,
    action: { kind: 'move-to-running', via: 'reconcile' },
    now: ctx.clock.now(),
    newId: ctx.newId,
  });

  const item = await ctx.readItem(second.item);
  const after = await ctx.store.read((tx) => tx.findAttemptByAgentSession(agentSession));

  expect(faults).toStrictEqual([]);
  expect([item.keptSession, after]).toStrictEqual([null, second.id]);
});

test('it hands the agent session to the rework when a reading first shows it after a wake that answered none', async () => {
  const ctx = await setupTest();
  const first = await ctx.seedBuild();
  const kept = await ctx.worker.reconcile(first);

  invariant(kept.kind !== 'absent' && kept.agentSession !== null, 'the session is kept');

  const agentSession = kept.agentSession;

  ctx.worker.setSession(first.id, { state: 'suspended', agentSession: null });

  const second = await ctx.seedReworkAfter(first);
  const before = await ctx.store.read((tx) => tx.findAttemptByAgentSession(agentSession));

  invariant(second.atcSession === first.atcSession, 'the rework runs on the kept session');
  invariant(before === first.id, 'the first build holds the agent session');

  ctx.worker.setSession(second.id, { state: 'running', agentSession });

  const reading = await ctx.worker.reconcile(second);

  const faults = await actOnReading({
    store: ctx.store,
    worker: ctx.worker,
    rules: ctx.rules(),
    backoff: ctx.backoff,
    attempt: second,
    reading,
    action: pickReadingAction({
      attempt: second,
      reading,
      step: null,
      sleep: ctx.rules().sleep,
      now: ctx.clock.now(),
    }),
    now: ctx.clock.now(),
    newId: ctx.newId,
  });

  const holder = await ctx.store.read((tx) => tx.findAttemptByAgentSession(agentSession));

  expect(faults).toStrictEqual([]);
  expect(holder).toBe(second.id);
});

test('it hands the agent session to the rework when a reading first shows it after a reconciled wake that showed none', async () => {
  const ctx = await setupTest();
  const first = await ctx.seedBuild();
  const kept = await ctx.worker.reconcile(first);

  invariant(kept.kind !== 'absent' && kept.agentSession !== null, 'the session is kept');

  const agentSession = kept.agentSession;

  ctx.worker.failNext('resumeKept', { kind: 'unknown', reason: 'the reply did not arrive' });

  const second = await ctx.seedReworkAfter(first);

  ctx.worker.setSession(first.id, { state: 'running', agentSession: null });

  const unbound = await ctx.worker.reconcile(first);

  const input = {
    store: ctx.store,
    worker: ctx.worker,
    rules: ctx.rules(),
    backoff: ctx.backoff,
    now: ctx.clock.now(),
    newId: ctx.newId,
  };

  await actOnReading({
    ...input,
    attempt: second,
    reading: unbound,
    action: { kind: 'move-to-running', via: 'reconcile' },
  });

  const running = await ctx.readAttempt(second.id);

  invariant(running.state === 'running', 'the table moved the rework to running');

  ctx.worker.setSession(first.id, { state: 'running', agentSession });

  const reading = await ctx.worker.reconcile(first);

  const faults = await actOnReading({
    ...input,
    attempt: running,
    reading,
    action: pickReadingAction({
      attempt: running,
      reading,
      step: null,
      sleep: ctx.rules().sleep,
      now: ctx.clock.now(),
    }),
  });

  const holder = await ctx.store.read((tx) => tx.findAttemptByAgentSession(agentSession));

  expect(faults).toStrictEqual([]);
  expect(holder).toBe(second.id);
});

test('it refuses the agent session of the kept session to a rework that runs on a fresh session', async () => {
  const ctx = await setupTest();
  const first = await ctx.seedBuild();
  const kept = await ctx.worker.reconcile(first);

  invariant(kept.kind !== 'absent' && kept.agentSession !== null, 'the session is kept');

  const agentSession = kept.agentSession;

  ctx.worker.failNext('resumeKept', { kind: 'refused', cause: 'other', reason: 'wake refused' });

  const second = await ctx.seedReworkAfter(first);

  invariant(second.atcSession !== first.atcSession, 'the rework runs on a fresh session');

  ctx.worker.setSession(second.id, { state: 'running', agentSession });

  const reading = await ctx.worker.reconcile(second);

  const faults = await actOnReading({
    store: ctx.store,
    worker: ctx.worker,
    rules: ctx.rules(),
    backoff: ctx.backoff,
    attempt: second,
    reading,
    action: pickReadingAction({
      attempt: second,
      reading,
      step: null,
      sleep: ctx.rules().sleep,
      now: ctx.clock.now(),
    }),
    now: ctx.clock.now(),
    newId: ctx.newId,
  });

  expect(faults).toStrictEqual([
    {
      kind: 'fault',
      fault: 'agent-session-owned',
      agentSession,
      attempt: second.id,
      holder: first.id,
    },
  ]);
});

test('it wakes the kept session again for a builder verify whose wake reply was lost after the grader changed', async () => {
  const ctx = await setupTest();

  ctx.setRules(loadVerifyRules({ session: 'builder', resume: false }));

  await ctx.seedBuild();
  await ctx.passReview();

  ctx.worker.failNext('resumeKept', { kind: 'unknown', reason: 'the reply did not arrive' });

  const claim = await ctx.claim();

  invariant(claim?.kind === 'start', 'the verify claims');

  ctx.setRules(loadVerifyRules({ session: 'fresh', resume: false }));

  const attempt = await ctx.readAttempt(claim.attempt.id);

  await actOnReading({
    store: ctx.store,
    worker: ctx.worker,
    rules: ctx.rules(),
    backoff: ctx.backoff,
    attempt,
    reading: { kind: 'absent' },
    action: { kind: 'respawn' },
    now: ctx.clock.now(),
    newId: ctx.newId,
  });

  const calls = ctx.worker.calls
    .filter((call) => call.subject === attempt.id)
    .map((call) => call.method);

  expect(calls).toStrictEqual(['resumeKept', 'resumeKept']);
});

test('it records a fallback in the reconciled fact of a builder verify whose fresh start lost its reply after the build session was gone', async () => {
  const ctx = await setupTest();

  ctx.setRules(loadVerifyRules({ session: 'builder', resume: false }));

  await ctx.seedBuild();
  await ctx.passReview();

  ctx.clock.advance(25 * 3_600_000);

  await ctx.forgetSessions();

  ctx.worker.failNext('start', { kind: 'unknown', reason: 'the reply did not arrive' });

  const verify = await ctx.claimStarting();

  await ctx.reconcileRunning(verify);

  const reconciled = await ctx.listReconciled();

  expect(reconciled).toStrictEqual([
    expect.objectContaining({ attempt: verify.id, resumeFallback: true }),
  ]);
});

test('it records a fallback in the reconciled fact of a builder verify whose fresh start lost its reply after the kept session refused the wake', async () => {
  const ctx = await setupTest();

  ctx.setRules(loadVerifyRules({ session: 'builder', resume: false }));

  await ctx.seedBuild();
  await ctx.passReview();

  ctx.worker.failNext('resumeKept', { kind: 'refused', cause: 'other', reason: 'no such session' });
  ctx.worker.failNext('start', { kind: 'unknown', reason: 'the reply did not arrive' });

  const verify = await ctx.claimStarting();

  await ctx.reconcileRunning(verify);

  const reconciled = await ctx.listReconciled();

  expect(reconciled).toStrictEqual([
    expect.objectContaining({ attempt: verify.id, resumeFallback: true }),
  ]);
});

test('it records no fallback in the reconciled fact of a builder verify whose wake of the kept session lost its reply', async () => {
  const ctx = await setupTest();

  ctx.setRules(loadVerifyRules({ session: 'builder', resume: false }));

  const build = await ctx.seedBuild();

  invariant(build.atcSession !== null, 'the build ran on a session');

  await ctx.passReview();

  ctx.worker.failNext('resumeKept', { kind: 'unknown', reason: 'the reply did not arrive' });

  const verify = await ctx.claimStarting();

  const now = ctx.clock.now();

  await actOnReading({
    store: ctx.store,
    worker: ctx.worker,
    rules: ctx.rules(),
    backoff: ctx.backoff,
    attempt: verify,
    reading: {
      kind: 'running',
      atcSession: build.atcSession,
      agentSession: null,
      caller: { issuer: 'fake-worker', subject: build.atcSession },
      attention: 'working',
      lastActivityAt: now,
      lastOwnerAt: now,
      usageLimitResetsAt: null,
    },
    action: { kind: 'move-to-running', via: 'reconcile' },
    now,
    newId: ctx.newId,
  });

  const reconciled = await ctx.listReconciled();

  expect(reconciled).toStrictEqual([
    expect.objectContaining({ attempt: verify.id, resumeFallback: false }),
  ]);
});

test('it records no fallback in the reconciled fact of a fresh verify whose start lost its reply', async () => {
  const ctx = await setupTest();

  ctx.setRules(loadVerifyRules({ session: 'fresh', resume: false }));

  await ctx.seedBuild();
  await ctx.passReview();

  ctx.worker.failNext('start', { kind: 'unknown', reason: 'the reply did not arrive' });

  const verify = await ctx.claimStarting();

  await ctx.reconcileRunning(verify);

  const reconciled = await ctx.listReconciled();

  expect(reconciled).toStrictEqual([
    expect.objectContaining({ attempt: verify.id, resumeFallback: false }),
  ]);
});
