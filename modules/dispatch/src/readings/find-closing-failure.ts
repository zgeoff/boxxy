import type { AttemptRow, ClosingCause, ForcedFailure } from '@boxxy/model';
import invariant from 'tiny-invariant';

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

// The cause that a closing attempt settles with, or null when it settles by its close-out.
export function findClosingFailure(attempt: AttemptRow): ForcedFailure | null {
  invariant(attempt.closing !== null, 'a closing attempt has a cause');

  return closingFailures[attempt.closing];
}
