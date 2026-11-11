import type {
  AttemptRow,
  ClosingCause,
  ForcedFailure,
  Instant,
  LiveAttemptState,
  SessionReading,
} from '@boxxy/model';
import invariant from 'tiny-invariant';
import { timeouts } from '../timeouts.ts';
import { findWaitingSince } from './find-waiting-since.ts';
import type { ReadingAction, ReadingInput, ReadingTable, RunningBound } from './types.ts';

const minuteMs = 60_000;
const secondMs = 1000;

// The reconcile table: one action for each reading of a live attempt's session. Pure.
export function pickReadingAction(input: ReadingInput): ReadingAction {
  const state = input.attempt.state;

  invariant(isLiveState(state), `the runner reads only live attempts, not ${state}`);

  return pickCell(input, state);
}

function isLiveState(state: AttemptRow['state']): state is LiveAttemptState {
  return state !== 'succeeded' && state !== 'failed';
}

// Read it as: the reading, then the attempt's state. v1-lifecycle.md has the same table.
const readingTable: ReadingTable = {
  running: {
    starting: moveToRunning,
    reconciling: moveToRunning,
    running: pickRunningBound,
    sleeping: pickSessionRan,
    waking: () => ({ kind: 'move-to-running', via: 'resume' }),
    closing: pickClosingStop,
  },
  suspended: {
    starting: sleepUnasked,
    reconciling: sleepUnasked,
    running: sleepUnasked,
    sleeping: nothing,
    waking: resumeOrLost,
    closing: settleClosing,
  },
  ended: {
    starting: settleWith(null),
    reconciling: settleWith(null),
    running: sleepOrSettle,
    sleeping: nothing,
    waking: resumeOrLost,
    closing: settleClosing,
  },
  absent: {
    starting: respawnOrLost,
    reconciling: respawnOrLost,
    running: settleWith('session-lost'),
    sleeping: settleWith('session-lost'),
    waking: settleWith('session-lost'),
    closing: awaitSpawnOrSettle,
  },
};

// Each reading kind narrows the input before it reaches its row of the table.
function pickCell(input: ReadingInput, state: LiveAttemptState): ReadingAction {
  const reading = input.reading;

  if (reading.kind === 'running') {
    return readingTable.running[state]({ ...input, reading });
  }

  if (reading.kind === 'suspended') {
    return readingTable.suspended[state]({ ...input, reading });
  }

  if (reading.kind === 'ended') {
    return readingTable.ended[state]({ ...input, reading });
  }

  return readingTable.absent[state]({ ...input, reading });
}

function moveToRunning(): ReadingAction {
  return { kind: 'move-to-running', via: 'reconcile' };
}

function pickRunningBound(
  input: ReadingInput<Extract<SessionReading, { kind: 'running' }>>,
): ReadingAction {
  for (const bound of runningBounds) {
    const action = bound.pick(input);

    if (action !== null) {
      return action;
    }
  }

  return { kind: 'bind-only' };
}

// The bounds of a running attempt whose session runs, in the order they are checked. A session
// that waits for the owner sleeps before the stall rule can stop it: both fall due 30 minutes
// after the last activity, and a stall first would leave the idle sleep no case in agent mode.
const runningBounds: readonly RunningBound[] = [
  {
    name: 'a suspend that did not happen',
    pick: (input) => (input.attempt.suspendRequestedAt === null ? null : { kind: 'clear-mark' }),
  },
  {
    name: 'the usage limit',
    pick: (input) =>
      input.reading.usageLimitResetsAt === null
        ? null
        : {
            kind: 'close',
            cause: 'usage-limit',
            resetsAt: input.reading.usageLimitResetsAt,
          },
  },
  {
    name: 'the step timeout, agent mode',
    pick: (input) => {
      const step = input.step;
      const since = getStretchStart(input.attempt);

      return input.attempt.mode === 'agent' &&
        step !== null &&
        input.now - since >= step.timeoutMinutes * minuteMs
        ? {
            kind: 'close',
            cause: 'timed-out',
            afterMinutes: step.timeoutMinutes,
          }
        : null;
    },
  },
  {
    name: 'a turn that ended with no close-out, agent mode',
    pick: (input) =>
      input.attempt.mode === 'agent' && input.reading.attention === 'turn-ended'
        ? { kind: 'close', cause: 'turn-ended' }
        : null,
  },
  {
    name: 'a session that waits for the owner',
    pick: (input) => {
      const waitingSince = findWaitingSince({
        attempt: input.attempt,
        reading: input.reading,
        quietAfterMinutes: input.sleep.afterQuietMinutes,
        now: input.now,
      });

      // atc cannot revive a session stopped before it captured the agent session ID
      if (waitingSince === null || input.reading.agentSession === null) {
        return null;
      }

      return input.now - waitingSince >= input.sleep.afterIdleMinutes * minuteMs
        ? { kind: 'sleep-if-idle', waitingSince }
        : { kind: 'bind-only' };
    },
  },
  {
    name: 'a stall, agent mode',
    pick: (input) =>
      input.attempt.mode === 'agent' &&
      input.now - input.reading.lastActivityAt >= timeouts.stallMinutes * minuteMs
        ? { kind: 'close', cause: 'stalled' }
        : null,
  },
  {
    name: 'an owner who has not attached, attended mode',
    pick: (input) => {
      const since = getLater(getStretchStart(input.attempt), input.reading.lastOwnerAt);

      return input.attempt.mode === 'attended' &&
        input.reading.agentSession !== null &&
        input.now - since >= input.sleep.afterUnattendedMinutes * minuteMs
        ? { kind: 'sleep-unattended', since }
        : null;
    },
  },
];

// One stretch of running starts at the start or at the latest wake.
function getStretchStart(attempt: AttemptRow): Instant {
  return getLater(attempt.startedAt ?? attempt.claimedAt, attempt.wokenAt);
}

function getLater(first: Instant, second: Instant | null): Instant {
  return second !== null && second > first ? second : first;
}

// The owner revived a sleeping session in atc: ask for the wake, and wake over the cap when no
// seat came free in time.
function pickSessionRan(input: ReadingInput): ReadingAction {
  const requestedAt = input.attempt.wakeRequestedAt;

  if (requestedAt === null) {
    return { kind: 'request-wake', by: 'session-ran' };
  }

  return input.now - requestedAt >= timeouts.seatlessSeconds * secondMs
    ? { kind: 'wake-over-cap' }
    : { kind: 'nothing' };
}

function pickClosingStop(
  input: ReadingInput<Extract<SessionReading, { kind: 'running' }>>,
): ReadingAction {
  const closingAt = input.attempt.closingAt;

  invariant(closingAt !== null, 'a closing attempt records when it closed');

  const closingMs = input.now - closingAt;

  if (closingMs >= timeouts.closingGiveUpMinutes * minuteMs) {
    return {
      kind: 'settle',
      forced: findClosingFailure(input.attempt),
      sessionStopped: false,
    };
  }

  const isInsideGrace =
    input.attempt.closing !== 'item-closed' &&
    input.reading.attention === 'working' &&
    closingMs < timeouts.stopGraceSeconds * secondMs;

  return isInsideGrace ? { kind: 'nothing' } : { kind: 'stop' };
}

// A closed-out attempt settles by its close-out; one that closed for its turn end has none
const closingFailures: Readonly<Record<ClosingCause, ForcedFailure | null>> = {
  'closed-out': null,
  'turn-ended': null,
  'timed-out': 'timed-out',
  'item-closed': 'item-closed',
  stalled: 'stalled',
  'skill-missing': 'skill-missing',
  'usage-limit': 'usage-limit',
};

function findClosingFailure(attempt: AttemptRow): ForcedFailure | null {
  invariant(attempt.closing !== null, 'a closing attempt has a cause');

  return closingFailures[attempt.closing];
}

// A session that stopped with no request of boxxy's: the host slept, so it wakes by itself.
function sleepUnasked(
  input: ReadingInput<Extract<SessionReading, { kind: 'suspended' }>>,
): ReadingAction {
  return {
    kind: 'sleep',
    requestWake: !input.reading.asked && input.attempt.suspendRequestedAt === null,
  };
}

function nothing(): ReadingAction {
  return { kind: 'nothing' };
}

function resumeOrLost(input: ReadingInput): ReadingAction {
  const wokenAt = input.attempt.wokenAt;

  invariant(wokenAt !== null, 'a waking attempt records when it woke');

  return input.now - wokenAt >= timeouts.resumeLostMinutes * minuteMs
    ? { kind: 'settle', forced: 'resume-lost', sessionStopped: true }
    : { kind: 'resume' };
}

function settleClosing(input: ReadingInput): ReadingAction {
  return {
    kind: 'settle',
    forced: findClosingFailure(input.attempt),
    sessionStopped: true,
  };
}

function settleWith(forced: ForcedFailure | null): () => ReadingAction {
  return () => ({ kind: 'settle', forced, sessionStopped: true });
}

function sleepOrSettle(input: ReadingInput): ReadingAction {
  return input.attempt.suspendRequestedAt === null
    ? { kind: 'settle', forced: null, sessionStopped: true }
    : { kind: 'sleep', requestWake: false };
}

function respawnOrLost(input: ReadingInput): ReadingAction {
  return input.now - input.attempt.claimedAt >= timeouts.spawnLostMinutes * minuteMs
    ? { kind: 'settle', forced: 'spawn-lost', sessionStopped: true }
    : { kind: 'respawn' };
}

// A closing attempt whose session was never seen: its spawn may still land. After the spawn
// time it settles as a stray, so the runner keeps looking for the session by its spawn name.
function awaitSpawnOrSettle(input: ReadingInput): ReadingAction {
  if (input.attempt.atcSession !== null) {
    return settleClosing(input);
  }

  return input.now - input.attempt.claimedAt >= timeouts.spawnLostMinutes * minuteMs
    ? {
        kind: 'settle',
        forced: findClosingFailure(input.attempt),
        sessionStopped: false,
      }
    : { kind: 'await-spawn' };
}
