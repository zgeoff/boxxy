import type { CallerIdentity } from '@boxxy/model';
import type { AtcSession } from './types.ts';

// The one place that reads who runs a session: the issuer and subject of the imp identity token
// that the broker signs for each call from the session's host. null when atc reports none.
export function findCallerIdentity(session: AtcSession): CallerIdentity | null {
  return session.caller ?? null;
}
