import { z } from 'zod';
import { postControl } from '../post-control.ts';
import { runBoxxy } from '../run-boxxy.ts';
import type { VerifyContext } from '../verify-context.ts';
import { controlRoutes } from './control-routes.ts';
import { readCloseOutBody } from './read-close-out-body.ts';
import type { CloseOutPreset } from './types.ts';

interface SessionInput {
  readonly closeOut: CloseOutPreset;

  // the session's work time on the harness clock
  readonly minutes: number;

  // the pull request that a `built` close-out links; null when the session opens none
  readonly pullRequest?: number | null;
}

// One attempt of the current item, from the claim to the settle: a tick claims it, the session's
// hook binds it, the session works and closes out, its turn ends, and two ticks settle it.
export async function runSession(ctx: VerifyContext, input: SessionInput) {
  const started = await postControl(ctx, controlRoutes.startSession, { queueMinutes: 0 });

  await runBoxxy(ctx, {
    argv: ['hook', 'session-start'],
    stdin: JSON.stringify(started.payload),
    schema: z.unknown(),
  });

  await postControl(ctx, controlRoutes.advanceClock, { minutes: input.minutes });

  const body = await readCloseOutBody(ctx, {
    closeOut: input.closeOut,
    pullRequest: input.pullRequest ?? null,
  });

  await runBoxxy(ctx, {
    argv: ['attempt', 'close-out'],
    stdin: JSON.stringify(body),
    schema: z.unknown(),
  });

  return postControl(ctx, controlRoutes.endTurn, { attempt: started.attempt });
}
