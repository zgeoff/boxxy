import type { AttemptRow, CallerIdentity } from '@boxxy/model';
import type { CallRef } from '../closeouts/types.ts';

export type CallAttempt =
  | { readonly kind: 'attempt'; readonly attempt: AttemptRow }
  | { readonly kind: 'refused'; readonly reason: 'no-attempt' | 'not-current' };

// The one check of every call from inside a session. `latest` is the latest attempt of the
// calling session, read inside the caller's lock. The call reaches the attempt it names only
// when that one is `latest` and holds the proven caller. Pure.
export function pickCallAttempt(latest: AttemptRow | null, call: CallRef): CallAttempt {
  if (latest === null) {
    return { kind: 'refused', reason: 'no-attempt' };
  }

  if (latest.id !== call.attempt) {
    return { kind: 'refused', reason: 'not-current' };
  }

  // a row with no caller, or another caller, is refused; an older row of the session never counts
  if (!isSameCaller(latest.caller, call.caller)) {
    return { kind: 'refused', reason: 'no-attempt' };
  }

  return { kind: 'attempt', attempt: latest };
}

function isSameCaller(recorded: CallerIdentity | null, proven: CallerIdentity): boolean {
  return (
    recorded !== null && recorded.issuer === proven.issuer && recorded.subject === proven.subject
  );
}
