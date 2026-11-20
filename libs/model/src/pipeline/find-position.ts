import type { Pipeline } from '../rules/types.ts';
import type { Instant, PhaseName } from '../types.ts';
import { advance } from './advance.ts';
import { findStep } from './find-step.ts';
import { isSignoffHold } from './is-signoff-hold.ts';
import { mergeByTime } from './merge-by-time.ts';
import type { Position, RetryLever, Settled } from './types.ts';

interface FindPositionInput {
  // the pipeline of the item's kind in the rules loaded now; null when the kind has none
  readonly pipeline: Pipeline | null;

  // the item's settled attempts, oldest first
  readonly attempts: readonly Settled[];

  // the item's `item.retry` and sign-off levers, oldest first
  readonly retries: readonly RetryLever[];

  // The instant of the read. A lever stamped after it has not happened yet, so it moves nothing:
  // a claim that skips a step at `now` then moves past the step, even when a retry carries a
  // later stamp, and cannot record the same skip again. Absent: every lever counts.
  readonly now?: Instant;
}

const skippedOutcome = 'skipped';

export function findPosition(input: FindPositionInput): Position {
  return trackPosition(input).position;
}

export interface PositionSince {
  readonly position: Position;

  // The instant of the last lever or settled attempt that set the position, which is when the item
  // reached it. Null when none did: the item still stands where the pipeline starts it, or has no
  // pipeline.
  readonly since: Instant | null;
}

export function trackPosition(input: FindPositionInput): PositionSince {
  const pipeline = input.pipeline;
  const first = pipeline?.steps[0];

  if (pipeline === null || first === undefined) {
    return { position: { kind: 'end', reason: 'no-pipeline' }, since: null };
  }

  let position: Position = { kind: 'phase', phase: first.phase, round: 1 };
  let since: Instant | null = null;
  let counted: Settled[] = [];
  let round = 1;

  for (const event of mergeByTime(input.attempts, input.retries)) {
    if (event.kind === 'retry') {
      if (input.now !== undefined && event.lever.at > input.now) {
        continue;
      }

      if (event.lever.signoff === true) {
        if (position.kind === 'hold' && isSignoffHold(pipeline, position)) {
          // the sign-off keeps the round and every edge's count
          position = { kind: 'phase', phase: position.then, round: position.round };
          since = event.lever.at;
        }

        continue;
      }

      counted = [];

      const phase: PhaseName | null = event.lever.phase ?? pickResumePhase(position);

      if (phase !== null && findStep(pipeline, phase) !== undefined) {
        const startsNewRound =
          event.lever.phase !== null ||
          (position.kind === 'hold' && position.reason === 'rounds used up');

        round += startsNewRound ? 1 : 0;

        const next: Position = { kind: 'phase', phase, round };

        // a retry that leaves the item at the same step and round is not a new arrival
        const staysPut =
          position.kind === 'phase' && position.phase === phase && position.round === round;

        position = next;
        since = staysPut ? since : event.lever.at;
      }

      continue;
    }

    const settled = event.settled;

    if (settled.failure === 'no-capacity' || settled.failure === 'usage-limit') {
      continue;
    }

    if (findStep(pipeline, settled.phase) === undefined) {
      continue;
    }

    position = advance({ pipeline, settled, counted, round });
    since = settled.endedAt;
    round = position.kind === 'end' ? round : position.round;

    // a skip counts toward no `maxAttempts` and no edge `max`
    if (settled.outcome !== skippedOutcome) {
      counted.push(settled);
    }
  }

  return { position, since };
}

function pickResumePhase(position: Position): PhaseName | null {
  if (position.kind === 'end') {
    return null;
  }

  return position.kind === 'hold' ? position.then : position.phase;
}
