import type { AttemptState, SessionMode } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { createMachine, types } from 'xstate';
import { attemptMoves } from './attempt-moves.ts';
import type { AttemptContext, AttemptMachineEvent, AttemptMove, MoveEffect } from './types.ts';

// The attempt states as an XState machine, built from the table of moves. Callers run it only
// through the pure `transition` and `initialTransition`, and read each move's writes from the
// `effect` events it emits.
export const attemptMachine = createMachine({
  schemas: {
    context: types<AttemptContext>(),
    input: types<{ mode: SessionMode }>(),
    events: {
      started: types<{ via: 'start' | 'reconcile' }>(),
      'spawn-unanswered': types<void>(),
      'session-seen': types<void>(),
      'closed-out': types<void>(),
      'timed-out': types<void>(),
      'item-closed': types<void>(),
      'turn-ended': types<void>(),
      stalled: types<void>(),
      'skill-missing': types<void>(),
      'suspend-asked': types<void>(),
      'suspend-refused': types<void>(),
      slept: types<void>(),
      'wake-requested': types<void>(),
      woken: types<{ overCap: boolean }>(),
      resumed: types<void>(),
      'wake-refused': types<void>(),
      settled: types<{ state: 'succeeded' | 'failed'; sessionStopped: boolean }>(),
      'stray-stopped': types<void>(),
    },
    emitted: { effect: types<{ effect: MoveEffect }>() },
  },
  context: (args) => ({
    mark: false,
    wakeRequested: false,
    mode: args.input.mode,
    holdGen: 1,
    closing: null,
    hasSession: false,
    strayed: false,
    sessionStopped: false,
  }),
  entry: (_args, enq) => {
    for (const effect of getClaimedMove().effects) {
      enq.emit({ type: 'effect', effect });
    }
  },
  initial: 'starting',
  states: {
    starting: { on: buildStateHandlers('starting') },
    reconciling: { on: buildStateHandlers('reconciling') },
    running: { on: buildStateHandlers('running') },
    sleeping: { on: buildStateHandlers('sleeping') },
    waking: { on: buildStateHandlers('waking') },
    closing: { on: buildStateHandlers('closing') },

    // plain states, not final: a final state drops `session-seen` and `stray-stopped`
    succeeded: { on: buildStateHandlers('succeeded') },
    failed: { on: buildStateHandlers('failed') },
  },
});

function getClaimedMove(): AttemptMove {
  const claimed = attemptMoves.find((move) => move.event === 'claimed');

  invariant(claimed !== undefined, 'the table of moves has a claimed row');

  return claimed;
}

interface MoveArgs {
  readonly context: AttemptContext;
  readonly event: AttemptMachineEvent;
}

interface EffectEvent {
  type: 'effect';
  effect: MoveEffect;
}

interface MoveEnqueue {
  readonly emit: (event: EffectEvent) => void;
}

interface MoveTarget {
  target?: AttemptState;
  context?: Partial<AttemptContext>;
}

type MoveHandler = (args: MoveArgs, enq: MoveEnqueue) => MoveTarget | undefined;

// Every state lists every event, and a handler with no matching row leaves its event unhandled.
// The type check of `createMachine` refuses an `on` object whose keys are optional.
function buildStateHandlers(state: AttemptState): Record<AttemptMachineEvent['type'], MoveHandler> {
  const build = (event: AttemptMachineEvent['type']): MoveHandler =>
    buildMoveHandler(
      attemptMoves.filter((move) => move.event === event && move.from.includes(state)),
    );

  return {
    started: build('started'),
    'spawn-unanswered': build('spawn-unanswered'),
    'session-seen': build('session-seen'),
    'closed-out': build('closed-out'),
    'timed-out': build('timed-out'),
    'item-closed': build('item-closed'),
    'turn-ended': build('turn-ended'),
    stalled: build('stalled'),
    'skill-missing': build('skill-missing'),
    'suspend-asked': build('suspend-asked'),
    'suspend-refused': build('suspend-refused'),
    slept: build('slept'),
    'wake-requested': build('wake-requested'),
    woken: build('woken'),
    resumed: build('resumed'),
    'wake-refused': build('wake-refused'),
    settled: build('settled'),
    'stray-stopped': build('stray-stopped'),
  };
}

function buildMoveHandler(moves: readonly AttemptMove[]): MoveHandler {
  return (args, enq) => {
    const move = moves.find((candidate) => candidate.when?.(args.context, args.event) ?? true);

    // XState counts any queued effect as a taken move, so the guard runs before the effects
    return move === undefined ? undefined : takeMove(move, args, enq);
  };
}

function takeMove(move: AttemptMove, args: MoveArgs, enq: MoveEnqueue): MoveTarget {
  for (const effect of move.effects) {
    enq.emit({ type: 'effect', effect });
  }

  const patch = move.context?.(args.context, args.event) ?? {};

  return move.to === 'same' ? { context: patch } : { target: move.to, context: patch };
}
