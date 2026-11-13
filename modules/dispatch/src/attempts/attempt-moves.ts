import type { AttemptState } from '@boxxy/model';
import type { AttemptMove } from './types.ts';

const liveStates: readonly AttemptState[] = [
  'starting',
  'reconciling',
  'running',
  'sleeping',
  'waking',
  'closing',
];

// The table of section A of the core flow sketch. The attempt machine is built from it, and the
// first row whose `from` and `when` match an event is the move.
export const attemptMoves: readonly AttemptMove[] = [
  {
    event: 'claimed',
    from: [],
    to: 'starting',
    effects: [
      'take-lease',
      'take-seats',
      'record-decision',
      'boxxy.attempt.claimed',
      'boxxy.decision.recorded',
    ],
  },
  {
    event: 'started',
    from: ['starting', 'reconciling'],
    when: (_context, event) => event.type === 'started' && event.via === 'start',
    to: 'running',
    effects: ['boxxy.attempt.started'],
    context: () => ({ hasSession: true }),
  },
  {
    event: 'started',
    from: ['starting', 'reconciling'],
    when: (_context, event) => event.type === 'started' && event.via === 'reconcile',
    to: 'running',
    effects: ['boxxy.attempt.reconciled'],
    context: () => ({ hasSession: true }),
  },
  {
    event: 'started',
    from: ['closing'],
    when: (context) => context.closing === 'item-closed' && !context.hasSession,
    to: 'same',
    effects: ['boxxy.attempt.started'],
    context: () => ({ hasSession: true }),
  },
  {
    event: 'spawn-unanswered',
    from: ['starting'],
    to: 'reconciling',
    effects: ['boxxy.attempt.spawn_unanswered'],
  },
  {
    event: 'session-seen',
    from: [...liveStates, 'succeeded', 'failed'],
    to: 'same',
    effects: ['bind-session', 'boxxy.attempt.session_bound'],
  },
  {
    event: 'closed-out',
    from: ['starting', 'reconciling', 'running', 'sleeping', 'waking'],
    to: 'closing',
    effects: ['boxxy.attempt.closed_out'],
    context: () => ({ closing: 'closed-out', mark: false, wakeRequested: false }),
  },
  {
    event: 'timed-out',
    from: ['running'],
    when: (context) => context.mode === 'agent',
    to: 'closing',
    effects: ['boxxy.attempt.timed_out'],
    context: () => ({ closing: 'timed-out' }),
  },
  {
    // the close of the item writes `boxxy.item.closed` for each attempt it ends
    event: 'item-closed',
    from: ['starting', 'reconciling', 'running', 'waking'],
    to: 'closing',
    effects: [],
    context: () => ({ closing: 'item-closed', mark: false, wakeRequested: false }),
  },
  {
    event: 'turn-ended',
    from: ['running'],
    when: (context) => context.mode === 'agent',
    to: 'closing',
    effects: ['boxxy.attempt.turn_ended'],
    context: () => ({ closing: 'turn-ended' }),
  },
  {
    // `boxxy.attempt.settled` carries the cause
    event: 'stalled',
    from: ['running'],
    when: (context) => context.mode === 'agent',
    to: 'closing',
    effects: [],
    context: () => ({ closing: 'stalled' }),
  },
  {
    // `boxxy.attempt.settled` carries the cause
    event: 'skill-missing',
    from: ['starting', 'reconciling', 'running'],
    to: 'closing',
    effects: [],
    context: () => ({ closing: 'skill-missing' }),
  },
  {
    // `boxxy.attempt.settled` carries the cause
    event: 'usage-limited',
    from: ['running'],
    to: 'closing',
    effects: [],
    context: () => ({ closing: 'usage-limit' }),
  },
  {
    event: 'suspend-asked',
    from: ['running'],
    when: (context) => !context.mark,
    to: 'same',
    effects: [],
    context: () => ({ mark: true }),
  },
  {
    event: 'suspend-refused',
    from: ['running'],
    when: (context) => context.mark,
    to: 'same',
    effects: [],
    context: () => ({ mark: false, wakeRequested: false }),
  },
  {
    event: 'slept',
    from: ['starting', 'reconciling', 'running'],
    to: 'sleeping',
    effects: ['release-seats', 'boxxy.attempt.slept'],
    context: () => ({ mark: false }),
  },
  {
    event: 'wake-requested',
    from: ['sleeping'],
    when: (context) => !context.wakeRequested,
    to: 'same',
    effects: ['boxxy.attempt.wake_requested'],
    context: () => ({ wakeRequested: true }),
  },
  {
    event: 'wake-requested',
    from: ['running'],
    when: (context) => context.mark,
    to: 'same',
    effects: ['boxxy.attempt.wake_requested'],
    context: () => ({ wakeRequested: true }),
  },
  {
    event: 'woken',
    from: ['sleeping'],
    to: 'waking',
    effects: ['take-seats', 'record-decision', 'boxxy.attempt.woken', 'boxxy.decision.recorded'],
    context: (context) => ({ holdGen: context.holdGen + 1 }),
  },
  {
    // the wake is done, so a later sleep starts with no request
    event: 'resumed',
    from: ['waking'],
    to: 'running',
    effects: ['boxxy.attempt.resumed'],
    context: () => ({ wakeRequested: false }),
  },
  {
    // the request stays, so a later claim tries the wake again
    event: 'wake-refused',
    from: ['waking'],
    to: 'sleeping',
    effects: ['release-seats', 'boxxy.attempt.slept'],
  },
  {
    event: 'settled',
    from: liveStates,
    when: (_context, event) => event.type === 'settled' && event.state === 'succeeded',
    to: 'succeeded',
    effects: ['release-seats', 'release-lease', 'boxxy.attempt.settled'],
    context: (_context, event) => ({
      strayed: event.type === 'settled' && !event.sessionStopped,
    }),
  },
  {
    event: 'settled',
    from: liveStates,
    when: (_context, event) => event.type === 'settled' && event.state === 'failed',
    to: 'failed',
    effects: ['release-seats', 'release-lease', 'boxxy.attempt.settled'],
    context: (_context, event) => ({
      strayed: event.type === 'settled' && !event.sessionStopped,
    }),
  },
  {
    event: 'stray-stopped',
    from: ['succeeded', 'failed'],
    when: (context) => context.strayed && !context.sessionStopped,
    to: 'same',
    effects: [],
    context: () => ({ sessionStopped: true }),
  },
  {
    // a job starts nothing outside boxxy, so its first read moves it to running
    event: 'job-started',
    from: ['starting'],
    when: (context) => !context.hasSession,
    to: 'running',
    effects: ['boxxy.attempt.job_started'],
  },
  {
    // a job whose read throws past the step's time limit, before or after its first read
    event: 'timed-out',
    from: ['starting', 'running'],
    when: (context) => !context.hasSession,
    to: 'closing',
    effects: ['boxxy.attempt.timed_out'],
    context: () => ({ closing: 'timed-out' }),
  },
  {
    // marked under the lease before the call, so a refused mark sends no call
    event: 'acted',
    from: ['running'],
    to: 'same',
    effects: ['boxxy.merge.requested'],
  },
  {
    event: 'answered',
    from: ['running'],
    to: 'same',
    effects: ['boxxy.merge.answered'],
  },
  {
    event: 'waited',
    from: ['running'],
    to: 'same',
    effects: [],
  },
  {
    // a job holds no session, so the runner settles it in the same tick
    event: 'job-finished',
    from: ['running'],
    to: 'closing',
    effects: ['boxxy.attempt.closed_out'],
    context: () => ({ closing: 'closed-out' }),
  },
  {
    // a stray session is forgotten only after it has stopped
    event: 'session-forgotten',
    from: ['succeeded', 'failed'],
    when: (context) => !context.sessionForgotten && (!context.strayed || context.sessionStopped),
    to: 'same',
    effects: [],
    context: () => ({ sessionForgotten: true }),
  },
];
