import type { AttemptRow, SessionFault, StoreTx } from '@boxxy/model';
import type { AttemptGuard } from '../attempts/is-same-guard.ts';
import type { MoveBase } from '../attempts/types.ts';
import { writeAttemptMove } from '../attempts/write-attempt-move.ts';
import { writeSessionBind } from '../attempts/write-session-bind.ts';
import { buildKeptClear } from '../sessions/build-kept-clear.ts';
import type { StartedSession } from './types.ts';

// Records a started session inside `tx`: the `started` move, which clears the item's kept session
// when the claim woke one, then the bind of the agent session, which the attempt of a woken kept
// session takes over. A move that does not apply binds nothing. Returns the bind's fault, or null.
export async function writeStartedSession(
  tx: StoreTx,
  attempt: Pick<AttemptRow, 'id' | 'item'>,
  session: StartedSession,
  base: MoveBase & { readonly seen?: Partial<AttemptGuard> },
): Promise<SessionFault | null> {
  const kept = session.kept;

  const moved = await writeAttemptMove(
    tx,
    attempt.id,
    {
      kind: 'started',
      via: session.via,
      atcSession: session.atcSession,
      caller: session.caller,
      resumeFallback: session.resumeFallback,
    },
    { ...base, also: kept === null ? [] : [buildKeptClear(attempt.item, kept)] },
  );

  const row = await tx.readAttempt(attempt.id);

  return moved.kind === 'applied' && row !== null && session.agentSession !== null
    ? writeSessionBind(
        tx,
        row,
        {
          atcSession: session.atcSession,
          agentSession: session.agentSession,
          keptFrom: session.resumeFallback || kept === null ? null : kept.attempt,
        },
        { actor: base.actor, now: base.now, newId: base.newId },
      )
    : null;
}
