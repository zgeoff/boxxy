import type { Pipeline } from '../rules/types.ts';
import { findStep } from './find-step.ts';
import type { Position } from './types.ts';

// The sign-off hold is the hold that the merge step's `needs-signoff` edge names.
export function isSignoffHold(pipeline: Pipeline, position: Position): boolean {
  if (position.kind !== 'hold') {
    return false;
  }

  const edge = findStep(pipeline, position.then)?.on['needs-signoff'];

  return typeof edge === 'object' && 'hold' in edge && edge.hold === position.reason;
}
