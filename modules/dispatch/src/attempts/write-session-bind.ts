import type { AttemptId, AttemptRow, SessionFault, StoreTx } from '@boxxy/model';
import type { MoveBase, SeenSession } from './types.ts';
import { writeAttemptMove } from './write-attempt-move.ts';

// Binds the agent session to the attempt, once. An agent session that another attempt holds
// gives the fault, which the server logs, unless that attempt succeeded on the same atc session
// and this one is live: this one woke the kept session, and takes the agent session over.
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

  if (holder !== null && !(await probeKeptHolder(tx, attempt, holder, session))) {
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

// a settled attempt never takes the agent session back from the attempt that took it over
async function probeKeptHolder(
  tx: StoreTx,
  attempt: AttemptRow,
  holder: AttemptId,
  session: SeenSession,
): Promise<boolean> {
  if (attempt.state === 'succeeded' || attempt.state === 'failed') {
    return false;
  }

  const row = await tx.readAttempt(holder);

  return row?.state === 'succeeded' && row.atcSession === session.atcSession;
}
