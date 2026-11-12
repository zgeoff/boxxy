import { expect, test } from 'bun:test';
import type { AttemptRow, AttemptState } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockNewId } from '../test-utils/build-mock-new-id.ts';
import { buildAttemptChange } from './build-attempt-change.ts';
import type { MoveEvent } from './types.ts';

function setupTest() {
  return {
    actor: 'boxxy:runner:runner-1' as const,
    now: brandSchemas.instant.parse(5000),
    newId: buildMockNewId(),
  };
}

type MoveCase = [
  title: string,
  from: AttemptState,
  overrides: Partial<AttemptRow>,
  event: MoveEvent,
  writes: readonly object[],
  facts: readonly string[],
];

// One case per row of the table of moves and per state it is allowed from.
test.each<MoveCase>([
  ...(['starting', 'reconciling'] as const).map((from): MoveCase => [
    `started by the worker from ${from}`,
    from,
    { atcSession: null, startedAt: null },
    {
      kind: 'started',
      via: 'start',
      atcSession: brandSchemas.atcSessionId.parse('atc-1'),
      caller: { issuer: 'https://id.test', subject: 'session-1' },
      resumeFallback: false,
    },
    [
      {
        op: 'update',
        table: 'attempts',
        set: {
          state: 'running',
          atcSession: 'atc-1',
          caller: { issuer: 'https://id.test', subject: 'session-1' },
          startedAt: 5000,
        },
      },
    ],
    ['boxxy.attempt.started'],
  ]),
  ...(['starting', 'reconciling'] as const).map((from): MoveCase => [
    `started by a reading from ${from}`,
    from,
    { atcSession: null, startedAt: null },
    {
      kind: 'started',
      via: 'reconcile',
      atcSession: brandSchemas.atcSessionId.parse('atc-1'),
      caller: null,
      resumeFallback: false,
    },
    [
      {
        op: 'update',
        table: 'attempts',
        set: { state: 'running', atcSession: 'atc-1', caller: null, startedAt: 5000 },
      },
    ],
    ['boxxy.attempt.reconciled'],
  ]),
  [
    'started on an attempt closed by its item before any session',
    'closing',
    { closing: 'item-closed', atcSession: null, startedAt: null },
    {
      kind: 'started',
      via: 'reconcile',
      atcSession: brandSchemas.atcSessionId.parse('atc-1'),
      caller: null,
      resumeFallback: false,
    },
    [
      {
        op: 'update',
        table: 'attempts',
        set: { state: 'closing', atcSession: 'atc-1', caller: null, startedAt: 5000 },
      },
    ],
    ['boxxy.attempt.started'],
  ],
  [
    'spawn-unanswered from starting',
    'starting',
    { atcSession: null },
    { kind: 'spawn-unanswered', reason: 'timeout' },
    [{ op: 'update', table: 'attempts', set: { state: 'reconciling' } }],
    ['boxxy.attempt.spawn_unanswered'],
  ],
  ...(
    [
      'starting',
      'reconciling',
      'running',
      'sleeping',
      'waking',
      'closing',
      'succeeded',
      'failed',
    ] as const
  ).map((from): MoveCase => [
    `session-seen from ${from}`,
    from,
    {},
    {
      kind: 'session-seen',
      row: {
        attempt: brandSchemas.attemptId.parse('0190a6f4-0000-7000-8000-0000000000aa'),
        agentSession: brandSchemas.agentSessionId.parse('agent-1'),
        atcSession: brandSchemas.atcSessionId.parse('atc-1'),
        product: 'claude_code',
        source: 'hook',
        seenAt: brandSchemas.instant.parse(4000),
      },
    },
    [{ op: 'insert', table: 'attempt_sessions' }],
    ['boxxy.attempt.session_bound'],
  ]),
  ...(['starting', 'reconciling', 'running', 'sleeping', 'waking'] as const).map(
    (from): MoveCase => [
      `closed-out from ${from}`,
      from,
      {
        suspendRequestedAt: brandSchemas.instant.parse(4000),
        wakeRequestedAt: brandSchemas.instant.parse(4000),
      },
      {
        kind: 'closed-out',
        closeOut: {
          result: { kind: 'built' },
          criteria: [],
          openItems: [],
          friction: [],
          frictionDropped: 0,
        },
        hash: buildMockV1AttemptRow().spawnRequestHash,
      },
      [
        {
          op: 'update',
          table: 'attempts',
          set: {
            state: 'closing',
            closing: 'closed-out',
            closingAt: 5000,
            suspendRequestedAt: null,
            wakeRequestedAt: null,
            closeOut: {
              result: { kind: 'built' },
              criteria: [],
              openItems: [],
              friction: [],
              frictionDropped: 0,
            },
            closeOutHash: expect.any(String),
            closeOutFact: '0190a6f4-0000-7000-8000-000000000001',
          },
        },
      ],
      ['boxxy.attempt.closed_out'],
    ],
  ),
  [
    'timed-out from running in agent mode',
    'running',
    { mode: 'agent' },
    { kind: 'timed-out', afterMinutes: 90 },
    [
      {
        op: 'update',
        table: 'attempts',
        set: { state: 'closing', closing: 'timed-out', closingAt: 5000 },
      },
    ],
    ['boxxy.attempt.timed_out'],
  ],
  ...(['starting', 'reconciling', 'running', 'waking'] as const).map((from): MoveCase => [
    `item-closed from ${from}`,
    from,
    { suspendRequestedAt: brandSchemas.instant.parse(4000) },
    { kind: 'item-closed' },
    [
      {
        op: 'update',
        table: 'attempts',
        set: {
          state: 'closing',
          closing: 'item-closed',
          closingAt: 5000,
          suspendRequestedAt: null,
        },
      },
    ],
    [],
  ]),
  [
    'turn-ended from running in agent mode',
    'running',
    { mode: 'agent' },
    { kind: 'turn-ended' },
    [
      {
        op: 'update',
        table: 'attempts',
        set: { state: 'closing', closing: 'turn-ended', closingAt: 5000 },
      },
    ],
    ['boxxy.attempt.turn_ended'],
  ],
  [
    'stalled from running in agent mode',
    'running',
    { mode: 'agent' },
    { kind: 'stalled' },
    [
      {
        op: 'update',
        table: 'attempts',
        set: { state: 'closing', closing: 'stalled', closingAt: 5000 },
      },
    ],
    [],
  ],
  ...(['starting', 'reconciling', 'running'] as const).map((from): MoveCase => [
    `skill-missing from ${from}`,
    from,
    {},
    { kind: 'skill-missing' },
    [
      {
        op: 'update',
        table: 'attempts',
        set: { state: 'closing', closing: 'skill-missing', closingAt: 5000 },
      },
    ],
    [],
  ]),
  [
    'usage-limited from running',
    'running',
    {},
    { kind: 'usage-limited' },
    [
      {
        op: 'update',
        table: 'attempts',
        set: { state: 'closing', closing: 'usage-limit', closingAt: 5000 },
      },
    ],
    [],
  ],
  [
    'suspend-asked from running with no mark',
    'running',
    { suspendRequestedAt: null },
    { kind: 'suspend-asked' },
    [{ op: 'update', table: 'attempts', set: { state: 'running', suspendRequestedAt: 5000 } }],
    [],
  ],
  [
    'suspend-refused from running with the mark',
    'running',
    {
      suspendRequestedAt: brandSchemas.instant.parse(4000),
      wakeRequestedAt: brandSchemas.instant.parse(4000),
    },
    { kind: 'suspend-refused' },
    [
      {
        op: 'update',
        table: 'attempts',
        set: { state: 'running', suspendRequestedAt: null, wakeRequestedAt: null },
      },
    ],
    [],
  ],
  ...(['starting', 'reconciling', 'running'] as const).map((from): MoveCase => [
    `slept from ${from}`,
    from,
    { suspendRequestedAt: brandSchemas.instant.parse(4000), holdGen: 2 },
    { kind: 'slept', idleSince: brandSchemas.instant.parse(3000), asked: true },
    [
      {
        op: 'update',
        table: 'attempts',
        set: { state: 'sleeping', suspendRequestedAt: null, sleptAt: 5000 },
      },
      { op: 'release-seats', release: expect.objectContaining({ holdGen: 2 }) },
    ],
    ['boxxy.attempt.slept'],
  ]),
  [
    'wake-requested from sleeping with no request',
    'sleeping',
    { wakeRequestedAt: null },
    { kind: 'wake-requested', by: 'command' },
    [{ op: 'update', table: 'attempts', set: { state: 'sleeping', wakeRequestedAt: 5000 } }],
    ['boxxy.attempt.wake_requested'],
  ],
  [
    'wake-requested from running with the mark',
    'running',
    { suspendRequestedAt: brandSchemas.instant.parse(4000), wakeRequestedAt: null },
    { kind: 'wake-requested', by: 'session-ran' },
    [{ op: 'update', table: 'attempts', set: { state: 'running', wakeRequestedAt: 5000 } }],
    ['boxxy.attempt.wake_requested'],
  ],
  [
    'woken from sleeping',
    'sleeping',
    { holdGen: 2 },
    {
      kind: 'woken',
      pick: {
        kind: 'wake',
        attempt: brandSchemas.attemptId.parse('0190a6f4-0000-7000-8000-0000000000aa'),
        limits: [brandSchemas.limitName.parse('workers')],
      },
      decision: {
        item: brandSchemas.itemId.parse('0190a6f4-0000-7000-8000-0000000000bb'),
        kind: 'wake',
        pool: brandSchemas.poolName.parse('main'),
        rulesVersion: brandSchemas.rulesVersion.parse('a'.repeat(64)),
        snapshotHash: brandSchemas.snapshotHash.parse('b'.repeat(64)),
        storeVersion: 7,
        pepysOffsets: {},
        faults: [],
        limits: [{ limit: brandSchemas.limitName.parse('workers'), held: 6, max: 7 }],
      },
      overCap: false,
    },
    [
      { op: 'update', table: 'attempts', set: { state: 'waking', holdGen: 3, wokenAt: 5000 } },
      {
        op: 'take-seats',
        take: expect.objectContaining({ limits: ['workers'], holdGen: 3, overCap: false }),
      },
      { op: 'insert', table: 'decisions' },
    ],
    ['boxxy.attempt.woken', 'boxxy.decision.recorded'],
  ],
  [
    'resumed from waking',
    'waking',
    { wakeRequestedAt: brandSchemas.instant.parse(4000) },
    { kind: 'resumed', atcSession: brandSchemas.atcSessionId.parse('atc-1'), caller: null },
    [
      {
        op: 'update',
        table: 'attempts',
        set: { state: 'running', wakeRequestedAt: null, atcSession: 'atc-1', caller: null },
      },
    ],
    ['boxxy.attempt.resumed'],
  ],
  [
    'wake-refused from waking',
    'waking',
    { wakeRequestedAt: brandSchemas.instant.parse(4000), holdGen: 3 },
    { kind: 'wake-refused' },
    [
      { op: 'update', table: 'attempts', set: { state: 'sleeping' } },
      { op: 'release-seats', release: expect.objectContaining({ holdGen: 3 }) },
    ],
    ['boxxy.attempt.slept'],
  ],
  ...(['starting', 'reconciling', 'running', 'sleeping', 'waking', 'closing'] as const).flatMap(
    (from) =>
      (['succeeded', 'failed'] as const).map((state): MoveCase => [
        `settled ${state} from ${from}`,
        from,
        { leaseGen: 4 },
        {
          kind: 'settled',
          state,
          failure: null,
          outcome: brandSchemas.outcomeName.parse('built'),
          returnedOutcome: null,
          sessionStopped: true,
          criteria: [],
          matched: [],
          frictionDropped: 0,
          skippedEffects: [],
        },
        [
          {
            op: 'update',
            table: 'attempts',
            set: { state, failure: null, outcome: 'built', returnedOutcome: null, endedAt: 5000 },
          },
          { op: 'release-seats' },
          {
            op: 'update',
            table: 'leases',
            key: expect.objectContaining({ gen: 4 }),
            set: { releasedAt: 5000 },
          },
        ],
        ['boxxy.attempt.settled'],
      ]),
  ),
  ...(['succeeded', 'failed'] as const).map((from): MoveCase => [
    `stray-stopped from ${from} with a stray session`,
    from,
    { strayedAt: brandSchemas.instant.parse(4000), sessionStoppedAt: null },
    { kind: 'stray-stopped', atcSession: null },
    [{ op: 'update', table: 'attempts', set: { state: from, sessionStoppedAt: 5000 } }],
    [],
  ]),
  [
    'stray-stopped that records the session found for a stray with none',
    'failed',
    { strayedAt: brandSchemas.instant.parse(4000), sessionStoppedAt: null, atcSession: null },
    { kind: 'stray-stopped', atcSession: brandSchemas.atcSessionId.parse('atc-late') },
    [
      {
        op: 'update',
        table: 'attempts',
        set: { state: 'failed', sessionStoppedAt: 5000, atcSession: 'atc-late' },
      },
    ],
    [],
  ],
  [
    'stray-stopped that keeps the session the stray already has',
    'failed',
    {
      strayedAt: brandSchemas.instant.parse(4000),
      sessionStoppedAt: null,
      atcSession: brandSchemas.atcSessionId.parse('atc-first'),
    },
    { kind: 'stray-stopped', atcSession: brandSchemas.atcSessionId.parse('atc-other') },
    [{ op: 'update', table: 'attempts', set: { state: 'failed', sessionStoppedAt: 5000 } }],
    [],
  ],
  ...(['succeeded', 'failed'] as const).map((from): MoveCase => [
    `session-forgotten from ${from}`,
    from,
    { sessionForgottenAt: null },
    { kind: 'session-forgotten' },
    [{ op: 'update', table: 'attempts', set: { state: from, sessionForgottenAt: 5000 } }],
    [],
  ]),
])('#buildAttemptChange allows %s', (...testCase) => {
  const [, from, overrides, event, writes, facts] = testCase;
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow({ ...overrides, state: from });
  const built: unknown = buildAttemptChange({ ...ctx, attempt, event });

  const change = expect.objectContaining({
    writes: writes.map((write) => expect.objectContaining(write)),
    facts: facts.map((type) => expect.objectContaining({ type })),
  });

  expect(built).toStrictEqual({ kind: 'change', change });
});

test.each<[title: string, from: AttemptState, overrides: Partial<AttemptRow>, event: MoveEvent]>([
  [
    'timed-out in attended mode',
    'running',
    { mode: 'attended' },
    { kind: 'timed-out', afterMinutes: 90 },
  ],
  ['turn-ended in attended mode', 'running', { mode: 'attended' }, { kind: 'turn-ended' }],
  ['stalled in attended mode', 'running', { mode: 'attended' }, { kind: 'stalled' }],
  [
    'started on a closing attempt that has a session',
    'closing',
    { closing: 'item-closed' },
    {
      kind: 'started',
      via: 'reconcile',
      atcSession: brandSchemas.atcSessionId.parse('atc-1'),
      caller: null,
      resumeFallback: false,
    },
  ],
  [
    'started on an attempt closing for another cause',
    'closing',
    { closing: 'timed-out', atcSession: null },
    {
      kind: 'started',
      via: 'reconcile',
      atcSession: brandSchemas.atcSessionId.parse('atc-1'),
      caller: null,
      resumeFallback: false,
    },
  ],
  ['spawn-unanswered from running', 'running', {}, { kind: 'spawn-unanswered', reason: 'timeout' }],
  [
    'closed-out from closing',
    'closing',
    { closing: 'timed-out' },
    {
      kind: 'closed-out',
      closeOut: {
        result: { kind: 'built' },
        criteria: [],
        openItems: [],
        friction: [],
        frictionDropped: 0,
      },
      hash: buildMockV1AttemptRow().spawnRequestHash,
    },
  ],
  ['item-closed from sleeping', 'sleeping', {}, { kind: 'item-closed' }],
  ['item-closed from closing', 'closing', { closing: 'closed-out' }, { kind: 'item-closed' }],
  [
    'suspend-asked with the mark',
    'running',
    { suspendRequestedAt: brandSchemas.instant.parse(4000) },
    { kind: 'suspend-asked' },
  ],
  [
    'suspend-refused with no mark',
    'running',
    { suspendRequestedAt: null },
    { kind: 'suspend-refused' },
  ],
  [
    'slept from waking',
    'waking',
    {},
    { kind: 'slept', idleSince: brandSchemas.instant.parse(3000), asked: true },
  ],
  [
    'wake-requested from sleeping with a request',
    'sleeping',
    { wakeRequestedAt: brandSchemas.instant.parse(4000) },
    { kind: 'wake-requested', by: 'command' },
  ],
  [
    'wake-requested from running with no mark',
    'running',
    { suspendRequestedAt: null },
    { kind: 'wake-requested', by: 'command' },
  ],
  [
    'resumed from sleeping',
    'sleeping',
    {},
    { kind: 'resumed', atcSession: brandSchemas.atcSessionId.parse('atc-1'), caller: null },
  ],
  ['wake-refused from running', 'running', {}, { kind: 'wake-refused' }],
  [
    'settled from failed',
    'failed',
    {},
    {
      kind: 'settled',
      state: 'failed',
      failure: 'session-lost',
      outcome: 'lost',
      returnedOutcome: null,
      sessionStopped: true,
      criteria: [],
      matched: [],
      frictionDropped: 0,
      skippedEffects: [],
    },
  ],
  [
    'stray-stopped from a failed attempt that never strayed',
    'failed',
    { strayedAt: null },
    { kind: 'stray-stopped', atcSession: null },
  ],
  [
    'stray-stopped from a stray whose session already stopped',
    'succeeded',
    {
      strayedAt: brandSchemas.instant.parse(3000),
      sessionStoppedAt: brandSchemas.instant.parse(4000),
    },
    { kind: 'stray-stopped', atcSession: null },
  ],
  [
    'session-forgotten twice',
    'succeeded',
    { sessionForgottenAt: brandSchemas.instant.parse(4000) },
    { kind: 'session-forgotten' },
  ],
  [
    'session-forgotten for a stray session that has not stopped',
    'failed',
    { strayedAt: brandSchemas.instant.parse(3000), sessionStoppedAt: null },
    { kind: 'session-forgotten' },
  ],
  ['session-forgotten for a live attempt', 'running', {}, { kind: 'session-forgotten' }],
])('#buildAttemptChange refuses %s', (...testCase) => {
  const [, from, overrides, event] = testCase;
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow({ ...overrides, state: from });
  const built: unknown = buildAttemptChange({ ...ctx, attempt, event });

  expect(built).toStrictEqual({ kind: 'not-allowed', state: from, event: event.kind });
});

test('#buildAttemptChange claims a new attempt with its lease, seats and decision', () => {
  const ctx = setupTest();
  const item = brandSchemas.itemId.parse('0190a6f4-0000-7000-8000-0000000000bb');
  const phase = brandSchemas.phaseName.parse('build');
  const pool = brandSchemas.poolName.parse('main');
  const workers = brandSchemas.limitName.parse('workers');
  const recipeHash = brandSchemas.recipeHash.parse('c'.repeat(64));
  const rulesVersion = brandSchemas.rulesVersion.parse('a'.repeat(64));
  const spawnRequestHash = buildMockV1AttemptRow().spawnRequestHash;

  const decision = {
    item,
    kind: 'start' as const,
    pool,
    rulesVersion,
    snapshotHash: brandSchemas.snapshotHash.parse('b'.repeat(64)),
    storeVersion: 7,
    pepysOffsets: {},
    faults: [],
    limits: [{ limit: workers, held: 2, max: 7 }],
  };

  const built: unknown = buildAttemptChange({
    ...ctx,
    attempt: null,
    event: {
      kind: 'claimed',
      attempt: brandSchemas.attemptId.parse('0190a6f4-0000-7000-8000-0000000000aa'),
      pick: {
        kind: 'start',
        item,
        phase,
        round: 2,
        pool,
        fields: { repo: ['acme/widgets'] },
        limits: [workers],
      },
      number: 3,
      runner: brandSchemas.runnerId.parse('runner-1'),
      leaseGen: 5,
      recipe: { hash: recipeHash, rulesVersion },
      skillsRef: null,
      spawnRequest: { prompt: 'build it' },
      spawnRequestHash,
      input: { findings: [] },
      mode: 'agent',
      worker: brandSchemas.workerKindName.parse('atc.session'),
      caller: null,
      decision,
    },
  });

  const attempt = '0190a6f4-0000-7000-8000-0000000000aa';

  const row = {
    id: attempt,
    item,
    phase,
    number: 3,
    runner: 'runner-1',
    recipeHash,
    rulesVersion,
    pool,
    leaseGen: 5,
    spawnRequest: { prompt: 'build it' },
    spawnRequestHash,
    state: 'starting',
    failure: null,
    atcSession: null,
    caller: null,
    claimedAt: 5000,
    startedAt: null,
    endedAt: null,
    fields: { repo: ['acme/widgets'] },
    mode: 'agent',
    round: 2,
    input: { findings: [] },
    holdGen: 1,
    closeOut: null,
    closeOutHash: null,
    closeOutFact: null,
    closing: null,
    closingAt: null,
    suspendRequestedAt: null,
    sleptAt: null,
    wakeRequestedAt: null,
    wokenAt: null,
    outcome: null,
    returnedOutcome: null,
    strayedAt: null,
    sessionStoppedAt: null,
    sessionForgottenAt: null,
    worker: 'atc.session',
    actedAt: null,
    actedHead: null,
    actedAnswer: null,
    readAt: null,
    waitReason: null,
  };

  const decisionRow = {
    ...decision,
    id: '0190a6f4-0000-7000-8000-000000000001',
    attempt,
    at: 5000,
  };

  expect(built).toStrictEqual({
    kind: 'change',
    change: {
      at: 5000,
      under: null,
      writes: [
        { op: 'insert', table: 'attempts', row },
        {
          op: 'insert',
          table: 'leases',
          row: { item, phase, attempt, gen: 5, takenAt: 5000, releasedAt: null },
        },
        { op: 'take-seats', take: { limits: [workers], attempt, holdGen: 1, overCap: false } },
        { op: 'insert', table: 'decisions', row: decisionRow },
      ],
      facts: [
        {
          id: '0190a6f4-0000-7000-8000-000000000002',
          type: 'boxxy.attempt.claimed',
          entity: `boxxy:item:${item}`,
          actor: 'boxxy:runner:runner-1',
          payload: {
            attempt,
            phase,
            number: 3,
            round: 2,
            mode: 'agent',
            pool,
            fields: { repo: ['acme/widgets'] },
            seats: [{ limit: workers }],
            recipeHash,
            skillsRef: null,
            rulesVersion,
          },
        },
        {
          id: '0190a6f4-0000-7000-8000-000000000003',
          type: 'boxxy.decision.recorded',
          entity: `boxxy:item:${item}`,
          actor: 'boxxy:runner:runner-1',
          payload: {
            id: decisionRow.id,
            attempt,
            item,
            kind: 'start',
            pool,
            rulesVersion,
            snapshotHash: decision.snapshotHash,
            snapshotStoreVersion: 7,
            pepysOffsets: {},
            faults: [],
            limits: decision.limits,
            at: 5000,
          },
        },
      ],
    },
  });
});

test('#buildAttemptChange settles a stray attempt under its live lease and marks it strayed', () => {
  const ctx = setupTest();

  const attempt = buildMockV1AttemptRow({
    state: 'closing',
    closing: 'closed-out',
    leaseGen: 4,
    holdGen: 2,
  });

  const built: unknown = buildAttemptChange({
    ...ctx,
    attempt,
    event: {
      kind: 'settled',
      state: 'succeeded',
      failure: null,
      outcome: brandSchemas.outcomeName.parse('built'),
      returnedOutcome: null,
      sessionStopped: false,
      criteria: [],
      matched: [],
      frictionDropped: 0,
      skippedEffects: [],
    },
  });

  expect(built).toStrictEqual({
    kind: 'change',
    change: {
      at: 5000,
      under: { item: attempt.item, phase: attempt.phase, gen: 4, holdGen: 2 },
      writes: [
        {
          op: 'update',
          table: 'attempts',
          key: { id: attempt.id },
          expect: {
            state: 'closing',
            holdGen: 2,
            suspendRequestedAt: null,
            wakeRequestedAt: null,
            closing: 'closed-out',
            atcSession: attempt.atcSession,
            strayedAt: null,
            sessionStoppedAt: null,
            sessionForgottenAt: null,
          },
          set: {
            state: 'succeeded',
            strayedAt: 5000,
            failure: null,
            outcome: 'built',
            returnedOutcome: null,
            endedAt: 5000,
          },
        },
        { op: 'release-seats', release: { attempt: attempt.id, holdGen: 2 } },
        {
          op: 'update',
          table: 'leases',
          key: { item: attempt.item, phase: attempt.phase, gen: 4 },
          expect: { attempt: attempt.id, releasedAt: null },
          set: { releasedAt: 5000 },
        },
      ],
      facts: [
        {
          id: '0190a6f4-0000-7000-8000-000000000001',
          type: 'boxxy.attempt.settled',
          entity: `boxxy:item:${attempt.item}`,
          actor: 'boxxy:runner:runner-1',
          payload: {
            attempt: attempt.id,
            phase: attempt.phase,
            round: 1,
            state: 'succeeded',
            failure: null,
            outcome: 'built',
            returnedOutcome: null,
            closing: 'closed-out',
            asleep: false,
            sessionStopped: false,
            endedAt: 5000,
            criteria: [],
            matched: [],
            frictionDropped: 0,
            skippedEffects: [],
          },
        },
      ],
    },
  });
});

test('#buildAttemptChange wakes over the cap with seats past the max under the next hold generation', () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow({ state: 'sleeping', holdGen: 2 });
  const workers = brandSchemas.limitName.parse('workers');

  const built: unknown = buildAttemptChange({
    ...ctx,
    attempt,
    event: {
      kind: 'woken',
      pick: { kind: 'wake', attempt: attempt.id, limits: [workers] },
      decision: {
        item: attempt.item,
        kind: 'wake',
        pool: attempt.pool,
        rulesVersion: attempt.rulesVersion,
        snapshotHash: brandSchemas.snapshotHash.parse('b'.repeat(64)),
        storeVersion: 7,
        pepysOffsets: {},
        faults: [],
        limits: [{ limit: workers, held: 7, max: 7 }],
      },
      overCap: true,
    },
  });

  const woken = expect.objectContaining({
    type: 'boxxy.attempt.woken',
    payload: { attempt: attempt.id, holdGen: 3, seats: [{ limit: workers }], overCap: true },
  });

  expect(built).toStrictEqual({
    kind: 'change',
    change: expect.objectContaining({
      writes: expect.arrayContaining([
        {
          op: 'take-seats',
          take: { limits: [workers], attempt: attempt.id, holdGen: 3, overCap: true },
        },
      ]),
      facts: expect.arrayContaining([woken]),
    }),
  });
});

test('#buildAttemptChange records the slept fact of a refused wake at the earlier sleep', () => {
  const ctx = setupTest();

  const attempt = buildMockV1AttemptRow({
    state: 'waking',
    sleptAt: brandSchemas.instant.parse(3000),
  });

  const built: unknown = buildAttemptChange({ ...ctx, attempt, event: { kind: 'wake-refused' } });

  expect(built).toStrictEqual({
    kind: 'change',
    change: expect.objectContaining({
      facts: [
        expect.objectContaining({ payload: { attempt: attempt.id, idleSince: 3000, asked: true } }),
      ],
    }),
  });
});

test('#buildAttemptChange builds a move of a settled attempt under no lease', () => {
  const ctx = setupTest();

  const attempt = buildMockV1AttemptRow({
    state: 'failed',
    strayedAt: brandSchemas.instant.parse(3000),
  });

  const built: unknown = buildAttemptChange({
    ...ctx,
    attempt,
    event: { kind: 'stray-stopped', atcSession: null },
  });

  expect(built).toStrictEqual({ kind: 'change', change: expect.objectContaining({ under: null }) });
});

test.each<
  [
    title: string,
    overrides: Partial<AttemptRow>,
    first: MoveEvent,
    second: MoveEvent,
    column: string,
    read: unknown,
    written: unknown,
  ]
>([
  [
    'two suspend-asked moves of one running attempt',
    { state: 'running', suspendRequestedAt: null },
    { kind: 'suspend-asked' },
    { kind: 'suspend-asked' },
    'suspendRequestedAt',
    null,
    5000,
  ],
  [
    'a close-out and a sleep of one running attempt',
    { state: 'running' },
    {
      kind: 'closed-out',
      closeOut: {
        result: { kind: 'built' },
        criteria: [],
        openItems: [],
        friction: [],
        frictionDropped: 0,
      },
      hash: buildMockV1AttemptRow().spawnRequestHash,
    },
    { kind: 'slept', idleSince: brandSchemas.instant.parse(3000), asked: true },
    'state',
    'running',
    'closing',
  ],
  [
    'two wake requests of one sleeping attempt',
    { state: 'sleeping', wakeRequestedAt: null },
    { kind: 'wake-requested', by: 'command' },
    { kind: 'wake-requested', by: 'session-ran' },
    'wakeRequestedAt',
    null,
    5000,
  ],
  [
    'two stray-stopped moves of one stray attempt',
    { state: 'failed', strayedAt: brandSchemas.instant.parse(3000), sessionStoppedAt: null },
    { kind: 'stray-stopped', atcSession: null },
    { kind: 'stray-stopped', atcSession: null },
    'sessionStoppedAt',
    null,
    5000,
  ],
])('#buildAttemptChange guards %s, so the second fails once the first applies', (...testCase) => {
  const [, overrides, first, second, column, read, written] = testCase;
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow(overrides);

  const built: unknown = [
    buildAttemptChange({ ...ctx, attempt, event: first }),
    buildAttemptChange({ ...ctx, attempt, event: second }),
  ];

  const firstWrite = expect.objectContaining({
    table: 'attempts',
    set: expect.objectContaining({ [column]: written }),
  });

  const secondWrite = expect.objectContaining({
    table: 'attempts',
    expect: expect.objectContaining({ [column]: read }),
  });

  expect(built).toStrictEqual([
    {
      kind: 'change',
      change: expect.objectContaining({ writes: expect.arrayContaining([firstWrite]) }),
    },
    {
      kind: 'change',
      change: expect.objectContaining({ writes: expect.arrayContaining([secondWrite]) }),
    },
  ]);
});
