import type { AttemptId, AttemptRow, SessionFault, StoreTx } from '@boxxy/model';
import type { MoveBase, SeenSession } from './types.ts';
import { writeAttemptMove } from './write-attempt-move.ts';

// Binds the agent session to the attempt, once. An agent session that another attempt holds
// writes nothing and gives the fault, which the server logs. The one exception is an attempt that
// succeeded on the same atc session: its kept session was woken, and the new attempt takes over.
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

  if (holder !== null && !(await probeKeptHolder(tx, holder, session))) {
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

async function probeKeptHolder(
  tx: StoreTx,
  holder: AttemptId,
  session: SeenSession,
): Promise<boolean> {
  const row = await tx.readAttempt(holder);

  return row?.state === 'succeeded' && row.atcSession === session.atcSession;
}
