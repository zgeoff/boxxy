import type { Pipeline } from '../rules/types.ts';
import type { PhaseName } from '../types.ts';
import { advance } from './advance.ts';
import { findStep } from './find-step.ts';
import { mergeByTime } from './merge-by-time.ts';
import type { Position, RetryLever, Settled } from './types.ts';

interface FindPositionInput {
  // the pipeline of the item's kind in the rules loaded now; null when the kind has none
  readonly pipeline: Pipeline | null;

  // the item's settled attempts, oldest first
  readonly attempts: readonly Settled[];

  // the item's `item.retry` levers, oldest first
  readonly retries: readonly RetryLever[];
}

export function findPosition(input: FindPositionInput): Position {
  const pipeline = input.pipeline;
  const first = pipeline?.steps[0];

  if (pipeline === null || first === undefined) {
    return { kind: 'end', reason: 'no-pipeline' };
  }

  let position: Position = { kind: 'phase', phase: first.phase, round: 1 };
  let counted: Settled[] = [];
  let round = 1;

  for (const event of mergeByTime(input.attempts, input.retries)) {
    if (event.kind === 'retry') {
      counted = [];

      const phase: PhaseName | null = event.lever.phase ?? pickResumePhase(position);

      if (phase !== null && findStep(pipeline, phase) !== undefined) {
        const startsNewRound =
          event.lever.phase !== null ||
          (position.kind === 'hold' && position.reason === 'rounds used up');

        round += startsNewRound ? 1 : 0;
        position = { kind: 'phase', phase, round };
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
    round = position.kind === 'end' ? round : position.round;

    counted.push(settled);
  }

  return position;
}

function pickResumePhase(position: Position): PhaseName | null {
  if (position.kind === 'end') {
    return null;
  }

  return position.kind === 'hold' ? position.then : position.phase;
}
