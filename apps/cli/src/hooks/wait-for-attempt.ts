import type { BoxxyClient } from '@boxxy/contract';
import { callerWait } from '../constants.ts';
import type { CLIDeps } from '../types.ts';

export type CurrentAttempt = Extract<
  Awaited<ReturnType<BoxxyClient['attempt']['current']>>,
  { kind: 'attempt' }
>;

// The attempt of this session, or null when the server still has none after the wait. The runner
// stores a session's caller after the worker answers the start, and a hook can run before that.
export async function waitForAttempt(
  client: BoxxyClient,
  deps: Pick<CLIDeps, 'sleep'>,
): Promise<CurrentAttempt | null> {
  for (let attempt = 1; attempt <= callerWait.tries; attempt += 1) {
    const current = await client.attempt.current({});

    if (current.kind === 'attempt') {
      return current;
    }

    if (attempt < callerWait.tries) {
      await deps.sleep(callerWait.delayMs);
    }
  }

  return null;
}
