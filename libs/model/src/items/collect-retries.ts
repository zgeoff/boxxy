import type { RetryLever } from '../pipeline/types.ts';
import type { LeverRow } from '../types.ts';
import { signoffApproveLeverKind, signoffSendBackLeverKind } from './constants.ts';

const retryKind = 'item.retry';

// Every lever that moves the item's position, oldest first: each `item.retry` and each sign-off
// lever the item ever had. `findPosition` drops the ones that follow its read.
export function collectRetries(levers: readonly LeverRow[]): RetryLever[] {
  return levers
    .flatMap((lever): RetryLever[] => {
      if (lever.kind === retryKind) {
        return [{ at: lever.at, phase: lever.phase }];
      }

      const isSignoff =
        lever.kind === signoffApproveLeverKind || lever.kind === signoffSendBackLeverKind;

      return isSignoff ? [{ at: lever.at, phase: null, signoff: true }] : [];
    })
    .toSorted((first, second) => first.at - second.at);
}
