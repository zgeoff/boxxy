import type { CallerIdentity } from '@boxxy/model';
import type { AtcSession } from './types.ts';

// The one place that reads who runs a session: the issuer of the host's identity token, with the
// machine's ID as the subject, never the name. null when the session has no host, or when the host lacks its ID or
// its issuer: the identity check refuses such a host, so boxxy refuses its calls the same way.
export function findCallerIdentity(session: AtcSession): CallerIdentity | null {
  const host = session.host;

  if (host?.id === undefined || host.issuer === undefined) {
    return null;
  }

  return { issuer: host.issuer, subject: host.id };
}
