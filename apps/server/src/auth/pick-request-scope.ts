import { createHash, timingSafeEqual } from 'node:crypto';
import invariant from 'tiny-invariant';
import type { Listener, RequestScope } from '../types.ts';

interface ScopeInput {
  readonly listener: Listener;

  // the `Authorization` header, or null
  readonly authorization: string | null;
  readonly workerTokenDigest: Uint8Array;
}

const bearerPattern = /^Bearer (?<token>\S+)$/u;

// Which scope a request runs in, from its listener and its bearer token alone. `null`: refuse it
// with 401. On the worker listener no token is never the owner: a call that went around the
// broker carries none.
export function pickRequestScope(input: ScopeInput): RequestScope | null {
  if (input.authorization === null) {
    return input.listener === 'owner' ? 'owner' : null;
  }

  const token = bearerPattern.exec(input.authorization)?.groups?.['token'];

  if (token === undefined) {
    return null;
  }

  // equal-length digests, so the comparison takes the same time for every wrong token
  return timingSafeEqual(buildTokenDigest(token), input.workerTokenDigest) ? 'worker' : null;
}

export function buildTokenDigest(token: string): Uint8Array {
  invariant(token.length > 0, 'the worker token is never empty');

  return createHash('sha256').update(token).digest();
}
