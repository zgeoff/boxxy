import invariant from 'tiny-invariant';
import type { Edge, Pipeline } from '../rules/types.ts';
import { countTrailing } from './count-trailing.ts';
import { findStep } from './find-step.ts';
import type { Position, Settled } from './types.ts';

interface AdvanceInput {
  readonly pipeline: Pipeline;
  readonly settled: Settled;

  // the attempts settled before this one and after the item's latest retry lever
  readonly counted: readonly Settled[];

  // the item's round before this attempt's edge
  readonly round: number;
}

// One step of the engine. `lost` acts as `again`. `unsettleable` has no entry in `on` under any
// rules file, so it always reaches the `outcome not in rules` hold.
export function advance(input: AdvanceInput): Position {
  const step = findStep(input.pipeline, input.settled.phase);

  invariant(step !== undefined, 'the settled attempt must belong to a step of the pipeline');

  const round = input.round;

  const edge: Edge | undefined =
    input.settled.outcome === 'lost' ? 'again' : step.on[input.settled.outcome];

  if (edge === undefined) {
    // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
    return { kind: 'hold', reason: 'outcome not in rules', then: step.phase, round };
  }

  if (edge === 'next') {
    const following = input.pipeline.steps[input.pipeline.steps.indexOf(step) + 1];

    return following === undefined
      ? { kind: 'end', reason: 'pipeline-done' }
      : { kind: 'phase', phase: following.phase, round };
  }

  if (edge === 'again') {
    const inARow =
      1 +
      countTrailing(
        input.counted,
        (earlier) =>
          earlier.outcome === 'lost' ||
          findStep(input.pipeline, earlier.phase)?.on[earlier.outcome] === 'again',
      );

    return inARow >= step.maxAttempts
      ? // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
        { kind: 'hold', reason: 'attempts used up', then: step.phase, round }
      : { kind: 'phase', phase: step.phase, round };
  }

  if ('end' in edge) {
    return { kind: 'end', reason: edge.end };
  }

  if ('hold' in edge) {
    // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
    return { kind: 'hold', reason: edge.hold, then: step.phase, round };
  }

  const taken =
    1 +
    input.counted.filter(
      (earlier) => earlier.phase === step.phase && earlier.outcome === input.settled.outcome,
    ).length;

  return edge.max !== undefined && taken > edge.max
    ? // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
      { kind: 'hold', reason: 'rounds used up', then: edge.to, round }
    : { kind: 'phase', phase: edge.to, round: round + 1 };
}
