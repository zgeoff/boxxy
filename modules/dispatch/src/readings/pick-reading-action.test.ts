import { expect, test } from 'bun:test';
import type { AttemptRow, LiveAttemptState, SessionReading } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockRunningReading } from '../test-utils/build-mock-running-reading.ts';
import { pickReadingAction } from './pick-reading-action.ts';
import type { ReadingAction } from './types.ts';

// Every attempt is claimed and started at minute 0, and each case reads at `atMinutes`.
function setupTest() {
  const time = { minute: (count: number) => brandSchemas.instant.parse(count * 60_000) };
  const minute = time.minute;
  const atcSession = brandSchemas.atcSessionId.parse('atc-1');
  const agentSession = brandSchemas.agentSessionId.parse('agent-1');

  const inState: Record<LiveAttemptState, Partial<AttemptRow>> = {
    starting: { state: 'starting', atcSession: null, startedAt: null },
    reconciling: { state: 'reconciling', atcSession: null, startedAt: null },
    running: { state: 'running' },
    sleeping: { state: 'sleeping', sleptAt: minute(0) },
    waking: { state: 'waking', wokenAt: minute(0) },
    closing: { state: 'closing', closing: 'closed-out', closingAt: minute(0) },
  };

  const ofKind: Record<SessionReading['kind'], SessionReading> = {
    running: buildMockRunningReading({ lastActivityAt: minute(0.5) }),
    suspended: { kind: 'suspended', atcSession, agentSession, asked: true },
    ended: { kind: 'ended', atcSession, agentSession },
    absent: { kind: 'absent' },
  };

  return {
    minute,
    inState,
    ofKind,
    pick: (attempt: Partial<AttemptRow>, reading: SessionReading, atMinutes: number) =>
      pickReadingAction({
        attempt: buildMockV1AttemptRow({
          atcSession,
          claimedAt: minute(0),
          startedAt: minute(0),
          ...attempt,
        }),
        reading,
        step: {
          phase: brandSchemas.phaseName.parse('build'),
          maxAttempts: 2,
          timeoutMinutes: 180,
          on: {},
        },
        sleep: {
          afterIdleMinutes: 30,
          afterQuietMinutes: 60,
          afterUnattendedMinutes: 240,
        },
        now: minute(atMinutes),
      }),
  };
}

// One case per cell of the reconcile table in v1-lifecycle.md, half a minute after the move, so
// inside every time bound.
test.each<[reading: SessionReading['kind'], state: LiveAttemptState, expected: ReadingAction]>([
  ['running', 'starting', { kind: 'move-to-running', via: 'reconcile' }],
  ['running', 'reconciling', { kind: 'move-to-running', via: 'reconcile' }],
  ['running', 'running', { kind: 'bind-only' }],
  ['running', 'sleeping', { kind: 'request-wake', by: 'session-ran' }],
  ['running', 'waking', { kind: 'move-to-running', via: 'resume' }],
  ['running', 'closing', { kind: 'nothing' }],
  ['suspended', 'starting', { kind: 'sleep', requestWake: false }],
  ['suspended', 'reconciling', { kind: 'sleep', requestWake: false }],
  ['suspended', 'running', { kind: 'sleep', requestWake: false }],
  ['suspended', 'sleeping', { kind: 'nothing' }],
  ['suspended', 'waking', { kind: 'resume' }],
  ['suspended', 'closing', { kind: 'settle', forced: null, sessionStopped: true }],
  ['ended', 'starting', { kind: 'settle', forced: null, sessionStopped: true }],
  ['ended', 'reconciling', { kind: 'settle', forced: null, sessionStopped: true }],
  ['ended', 'running', { kind: 'settle', forced: null, sessionStopped: true }],
  ['ended', 'sleeping', { kind: 'nothing' }],
  ['ended', 'waking', { kind: 'resume' }],
  ['ended', 'closing', { kind: 'settle', forced: null, sessionStopped: true }],
  ['absent', 'starting', { kind: 'respawn' }],
  ['absent', 'reconciling', { kind: 'respawn' }],
  ['absent', 'running', { kind: 'settle', forced: 'session-lost', sessionStopped: true }],
  ['absent', 'sleeping', { kind: 'settle', forced: 'session-lost', sessionStopped: true }],
  ['absent', 'waking', { kind: 'settle', forced: 'session-lost', sessionStopped: true }],
  ['absent', 'closing', { kind: 'settle', forced: null, sessionStopped: true }],
])('#pickReadingAction maps a %s reading of a %s attempt', (reading, state, expected) => {
  const ctx = setupTest();

  expect(ctx.pick(ctx.inState[state], ctx.ofKind[reading], 0.5)).toStrictEqual(expected);
});

test.each<
  [
    title: string,
    attempt: Partial<AttemptRow>,
    reading: Partial<Extract<SessionReading, { kind: 'running' }>>,
    atMinutes: number,
    expected: ReadingAction,
  ]
>([
  [
    'clears a suspend mark that did not stop the session',
    { suspendRequestedAt: brandSchemas.instant.parse(0) },
    { lastActivityAt: brandSchemas.instant.parse(0) },
    1,
    { kind: 'clear-mark' },
  ],
  [
    'closes a session that hit the usage limit, in either mode',
    { mode: 'attended' },
    { usageLimitResetsAt: brandSchemas.instant.parse(7_200_000) },
    1,
    { kind: 'close', cause: 'usage-limit', resetsAt: brandSchemas.instant.parse(7_200_000) },
  ],
  [
    'closes an agent-mode attempt past its step time limit',
    {},
    { lastActivityAt: brandSchemas.instant.parse(180 * 60_000) },
    180,
    { kind: 'close', cause: 'timed-out', afterMinutes: 180 },
  ],
  [
    'counts the step time limit from the latest wake',
    { wokenAt: brandSchemas.instant.parse(100 * 60_000) },
    { lastActivityAt: brandSchemas.instant.parse(180 * 60_000) },
    180,
    { kind: 'bind-only' },
  ],
  [
    'leaves an attended attempt past the step time limit alone',
    { mode: 'attended' },
    { lastActivityAt: brandSchemas.instant.parse(180 * 60_000) },
    180,
    { kind: 'bind-only' },
  ],
  [
    'closes an agent-mode session whose turn ended with no close-out',
    {},
    { attention: 'turn-ended' },
    1,
    { kind: 'close', cause: 'turn-ended' },
  ],
  [
    'sleeps an agent-mode session that asked for input 30 minutes ago, before the stall rule',
    {},
    { attention: 'needs-input' },
    30,
    { kind: 'sleep-if-idle', waitingSince: brandSchemas.instant.parse(0) },
  ],
  [
    'keeps an agent-mode session that asked for input 29 minutes ago',
    {},
    { attention: 'needs-input' },
    29,
    { kind: 'bind-only' },
  ],
  [
    'stalls an agent-mode session that asks for input before atc has its agent session',
    {},
    { attention: 'needs-input', agentSession: null },
    30,
    { kind: 'close', cause: 'stalled' },
  ],
  [
    'stalls an agent-mode working session with no activity for 30 minutes',
    {},
    {},
    30,
    { kind: 'close', cause: 'stalled' },
  ],
  [
    'sleeps an attended session whose turn ended 30 minutes ago',
    { mode: 'attended' },
    { attention: 'turn-ended' },
    30,
    { kind: 'sleep-if-idle', waitingSince: brandSchemas.instant.parse(0) },
  ],
  [
    'keeps an attended waiting session before atc has its agent session',
    { mode: 'attended' },
    { attention: 'turn-ended', agentSession: null },
    30,
    { kind: 'bind-only' },
  ],
  [
    'sleeps an attended working session with no activity for the quiet time',
    { mode: 'attended' },
    {},
    60,
    { kind: 'sleep-if-idle', waitingSince: brandSchemas.instant.parse(0) },
  ],
  [
    'keeps an attended working session that is quiet for less than the quiet time',
    { mode: 'attended' },
    {},
    59,
    { kind: 'bind-only' },
  ],
  [
    'sleeps a woken session that did nothing since the wake',
    { wokenAt: brandSchemas.instant.parse(10 * 60_000) },
    { lastActivityAt: brandSchemas.instant.parse(5 * 60_000) },
    40,
    { kind: 'sleep-if-idle', waitingSince: brandSchemas.instant.parse(10 * 60_000) },
  ],
  [
    'sleeps an active attended session whose owner has not attached for 240 minutes',
    { mode: 'attended' },
    { lastActivityAt: brandSchemas.instant.parse(239 * 60_000) },
    240,
    { kind: 'sleep-unattended', since: brandSchemas.instant.parse(0) },
  ],
  [
    'keeps an active attended session whose owner attached inside 240 minutes',
    { mode: 'attended' },
    {
      lastActivityAt: brandSchemas.instant.parse(239 * 60_000),
      lastOwnerAt: brandSchemas.instant.parse(1 * 60_000),
    },
    240,
    { kind: 'bind-only' },
  ],
])('#pickReadingAction %s', (...[, attempt, reading, atMinutes, expected]) => {
  const ctx = setupTest();
  const action = ctx.pick(attempt, buildMockRunningReading(reading), atMinutes);

  expect(action).toStrictEqual(expected);
});

test.each<
  [title: string, attempt: Partial<AttemptRow>, atMinutes: number, expected: ReadingAction]
>([
  [
    'waits for a seat while a revived session asked for its wake under 10 seconds ago',
    { state: 'sleeping', wakeRequestedAt: brandSchemas.instant.parse(55_000) },
    1,
    { kind: 'nothing' },
  ],
  [
    'wakes a revived session over the cap 10 seconds after its wake request',
    { state: 'sleeping', wakeRequestedAt: brandSchemas.instant.parse(50_000) },
    1,
    { kind: 'wake-over-cap' },
  ],
  [
    'stops a closing session after the grace time',
    {
      state: 'closing',
      closing: 'closed-out',
      closingAt: brandSchemas.instant.parse(0),
    },
    1,
    { kind: 'stop' },
  ],
  [
    'stops at once a session closed by its item',
    {
      state: 'closing',
      closing: 'item-closed',
      closingAt: brandSchemas.instant.parse(0),
    },
    0.5,
    { kind: 'stop' },
  ],
  [
    'settles by the give-up rule a closing session that still runs after 10 minutes',
    {
      state: 'closing',
      closing: 'timed-out',
      closingAt: brandSchemas.instant.parse(0),
    },
    10,
    { kind: 'settle', forced: 'timed-out', sessionStopped: false },
  ],
])('#pickReadingAction %s', (_title, attempt, atMinutes, expected) => {
  const ctx = setupTest();
  const action = ctx.pick(attempt, buildMockRunningReading(), atMinutes);

  expect(action).toStrictEqual(expected);
});

test.each<
  [
    title: string,
    attempt: Partial<AttemptRow>,
    reading: SessionReading,
    atMinutes: number,
    expected: ReadingAction,
  ]
>([
  [
    'asks for the wake of a host that slept with no request',
    { state: 'running', suspendRequestedAt: null },
    {
      kind: 'suspended',
      atcSession: brandSchemas.atcSessionId.parse('atc-1'),
      agentSession: null,
      asked: false,
    },
    1,
    { kind: 'sleep', requestWake: true },
  ],
  [
    'sleeps a marked attempt whose local session ended',
    { state: 'running', suspendRequestedAt: brandSchemas.instant.parse(0) },
    {
      kind: 'ended',
      atcSession: brandSchemas.atcSessionId.parse('atc-1'),
      agentSession: null,
    },
    1,
    { kind: 'sleep', requestWake: false },
  ],
  [
    'settles as resume-lost a woken session that does not run after 10 minutes',
    { state: 'waking', wokenAt: brandSchemas.instant.parse(0) },
    {
      kind: 'ended',
      atcSession: brandSchemas.atcSessionId.parse('atc-1'),
      agentSession: null,
    },
    10,
    { kind: 'settle', forced: 'resume-lost', sessionStopped: true },
  ],
  [
    'settles as spawn-lost a spawn with no session after 10 minutes',
    { state: 'reconciling', atcSession: null },
    { kind: 'absent' },
    10,
    { kind: 'settle', forced: 'spawn-lost', sessionStopped: true },
  ],
  [
    'awaits the spawn of an attempt closed before any session was seen',
    { state: 'closing', closing: 'item-closed', atcSession: null },
    { kind: 'absent' },
    9,
    { kind: 'await-spawn' },
  ],
  [
    'settles as a stray an attempt closed before its spawn that saw no session in 10 minutes',
    { state: 'closing', closing: 'item-closed', atcSession: null },
    { kind: 'absent' },
    10,
    { kind: 'settle', forced: 'item-closed', sessionStopped: false },
  ],
  [
    'settles a closing attempt by its cause when the session stopped',
    { state: 'closing', closing: 'stalled' },
    {
      kind: 'suspended',
      atcSession: brandSchemas.atcSessionId.parse('atc-1'),
      agentSession: null,
      asked: true,
    },
    1,
    { kind: 'settle', forced: 'stalled', sessionStopped: true },
  ],
])('#pickReadingAction %s', (...[, attempt, reading, atMinutes, expected]) => {
  const ctx = setupTest();
  const action = ctx.pick({ closingAt: ctx.minute(0), ...attempt }, reading, atMinutes);

  expect(action).toStrictEqual(expected);
});
