import type { AttemptRow, SessionFault, StoreTx } from '@boxxy/model';
import type { MoveBase, SeenSession } from './types.ts';
import { writeAttemptMove } from './write-attempt-move.ts';

// Binds the agent session to the attempt, once. An agent session that another attempt holds
// writes nothing and gives the fault, which the server logs.
export async function writeSessionBind(
  tx: StoreTx,
  attempt: AttemptRow,
  session: SeenSession,
  base: MoveBase,
): Promise<SessionFault | null> {
  const holder = await tx.findAttemptByAgentSession(session.agentSession);

  if (holder === attempt.id) {
    return null;
  }

  if (holder !== null) {
    return {
      kind: 'fault',
      fault: 'agent-session-owned',
      agentSession: session.agentSession,
      attempt: attempt.id,
      holder,
    };
  }

  await writeAttemptMove(
    tx,
    attempt.id,
    {
      kind: 'session-seen',
      row: {
        attempt: attempt.id,
        agentSession: session.agentSession,
        atcSession: session.atcSession,
        product: 'claude_code',
        source: 'worker',
        seenAt: base.now,
      },
    },
    base,
  );

  return null;
}
