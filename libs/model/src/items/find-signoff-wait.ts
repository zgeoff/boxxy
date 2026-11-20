import { mergeCloseOutSchema } from '../closeouts/merge-close-out-schema.ts';
import { mergeInputSchema } from '../closeouts/merge-input-schema.ts';
import { isSignoffHold } from '../pipeline/is-signoff-hold.ts';
import type { Position } from '../pipeline/types.ts';
import type { Pipeline } from '../rules/types.ts';
import type { AttemptRow, CommitSha, Instant, PullRequestRef } from '../types.ts';

// What the owner needs to answer an item that waits for a sign-off: the head and the reasons of
// the merge attempt that sent the item to the hold.
export interface SignoffWait {
  readonly pullRequest: PullRequestRef;
  readonly head: CommitSha;
  readonly rules: readonly string[];
  readonly paths: readonly string[];
  readonly truncated: boolean;

  // when the merge attempt that sent the item to the hold finished
  readonly since: Instant;
}

interface SignoffWaitInput {
  readonly pipeline: Pipeline | null;
  readonly position: Position;

  // the item's attempts, oldest first
  readonly attempts: readonly AttemptRow[];
}

// An item waits for a sign-off when it stands at the sign-off hold, its latest merge attempt
// finished `needs-signoff`, and no attempt of it is running.
export function findSignoffWait(input: SignoffWaitInput): SignoffWait | null {
  if (
    input.pipeline === null ||
    !isSignoffHold(input.pipeline, input.position) ||
    input.attempts.some((attempt) => attempt.endedAt === null)
  ) {
    return null;
  }

  const latest = input.attempts.findLast(
    (attempt) => attempt.phase === 'merge' && attempt.endedAt !== null,
  );

  if (latest?.endedAt === null || latest === undefined || latest.outcome !== 'needs-signoff') {
    return null;
  }

  const closeOut = mergeCloseOutSchema.safeParse(latest.closeOut);
  const pullRequest = mergeInputSchema.safeParse(latest.input);

  if (
    !closeOut.success ||
    closeOut.data.head === null ||
    !pullRequest.success ||
    pullRequest.data.pullRequest === null
  ) {
    return null;
  }

  return {
    pullRequest: {
      repo: pullRequest.data.pullRequest.repo,
      number: pullRequest.data.pullRequest.number,
    },
    head: closeOut.data.head,
    rules: closeOut.data.signoff?.rules ?? [],
    paths: closeOut.data.signoff?.paths ?? [],
    truncated: closeOut.data.signoff?.truncated ?? false,
    since: latest.endedAt,
  };
}
