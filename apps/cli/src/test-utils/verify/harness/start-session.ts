import { join } from 'node:path';
import invariant from 'tiny-invariant';
import type { z } from 'zod';
import { ControlConflictError } from './control-conflict-error.ts';
import type { controlRoutes } from './control-routes.ts';
import type { VerifyHarness } from './types.ts';

const minuteMs = 60_000;

type Answer = z.output<(typeof controlRoutes)['startSession']['response']>;

interface StartInput {
  readonly queueMinutes: number;
}

// Advances the clock by the queue wait and runs one tick. The fake caller proof then answers as the
// session of the current item's new attempt, and the answer is the payload of its session-start
// hook, with a workspace in the run folder.
export async function startSession(harness: VerifyHarness, input: StartInput): Promise<Answer> {
  if (harness.current === null) {
    throw new ControlConflictError('no current item: run file-item or land-item first');
  }

  harness.server.dispatch.clock.advance(input.queueMinutes * minuteMs);

  await harness.server.tick();

  const live = await harness.server.deps.store.read((tx) => tx.listLiveAttempts());

  const attempt = live.find((row) => row.item === harness.current);

  if (attempt === undefined) {
    throw new ControlConflictError('the tick claimed no attempt for the current item');
  }

  invariant(attempt.caller !== null, 'the fake worker reports the caller of each session');

  harness.server.callerProof.setCaller(attempt.caller);

  const reading = await harness.server.dispatch.worker.reconcile(attempt);

  invariant(
    reading.kind === 'running' && reading.agentSession !== null,
    'the started session runs, and the fake worker gives it an agent session',
  );

  return {
    attempt: attempt.id,
    phase: attempt.phase,
    payload: {
      session_id: reading.agentSession,
      cwd: join(harness.runDirectory, 'workspace'),
      hook_event_name: 'SessionStart',
      source: 'startup',
    },
  };
}
