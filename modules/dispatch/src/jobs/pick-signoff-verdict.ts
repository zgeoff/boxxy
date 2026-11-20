import type { AttemptRow, LeverRow, SignoffVerdict } from '@boxxy/model';
import { signoffApproveLeverKind, signoffSendBackLeverKind } from '@boxxy/model';
import invariant from 'tiny-invariant';

// The owner's verdict that the merge rule reads: the latest sign-off lever that no merge attempt
// has finished on since. An approval stays valid until the head moves, and the merge rule checks
// the head, so only a send-back is spent: it counts for the one merge attempt that follows it.
export function pickSignoffVerdict(
  levers: readonly LeverRow[],
  attempts: readonly AttemptRow[],
): SignoffVerdict | null {
  const open = levers.filter(
    (lever) =>
      (lever.kind === signoffApproveLeverKind ||
        (lever.kind === signoffSendBackLeverKind && !isSpent(lever, attempts))) &&
      lever.head !== null,
  );

  const [latest] = open.toSorted((first, second) => second.seq - first.seq);

  if (latest?.head === null || latest === undefined) {
    return null;
  }

  if (latest.kind === signoffApproveLeverKind) {
    return { head: latest.head, verdict: 'approve', findings: null, lever: latest.seq };
  }

  invariant(latest.reason !== null, 'a send-back lever carries its findings');

  return { head: latest.head, verdict: 'send-back', findings: latest.reason, lever: latest.seq };
}

function isSpent(lever: LeverRow, attempts: readonly AttemptRow[]): boolean {
  return attempts.some(
    (attempt) =>
      attempt.phase === 'merge' && attempt.endedAt !== null && attempt.endedAt >= lever.at,
  );
}
