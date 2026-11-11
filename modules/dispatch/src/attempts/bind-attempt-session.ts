import type {
  AgentSessionId,
  ClaimStore,
  Instant,
  NewId,
  SessionFault,
  StoreTx,
} from '@boxxy/model';
import type { CallRef } from '../closeouts/types.ts';
import { pickCallAttempt } from './pick-call-attempt.ts';
import { writeAttemptMove } from './write-attempt-move.ts';
import { writeSessionBind } from './write-session-bind.ts';

export interface BindAttemptSessionInput {
  readonly store: ClaimStore;
  readonly call: CallRef;
  readonly agentSession: AgentSessionId;

  // each skill the recipe lists that the session-start hook did not find after its fetch
  readonly missingSkills: readonly string[];
  readonly now: Instant;
  readonly newId: NewId;
}

export type BindAnswer =
  | { readonly kind: 'bound' | 'no-attempt' | 'not-current' | 'skill-missing' }
  | SessionFault;

// The session-start hook's call. It reaches only the attempt that `pickCallAttempt` gives. A
// missing skill moves the attempt to `closing`, and the runner settles it as `skill-missing`.
export function bindAttemptSession(input: BindAttemptSessionInput): Promise<BindAnswer> {
  return input.store.exclusive((tx) => writeBind(tx, input));
}

async function writeBind(tx: StoreTx, input: BindAttemptSessionInput): Promise<BindAnswer> {
  const latest = await tx.findAttemptBySession(input.call.session);

  const picked = pickCallAttempt(latest, input.call);

  if (picked.kind === 'refused') {
    return { kind: picked.reason };
  }

  const attempt = picked.attempt;
  const base = { actor: `boxxy:hook:${attempt.id}`, now: input.now, newId: input.newId } as const;

  if (input.missingSkills.length > 0) {
    await writeAttemptMove(tx, attempt.id, { kind: 'skill-missing' }, base);

    return { kind: 'skill-missing' };
  }

  const fault = await writeSessionBind(
    tx,
    attempt,
    { atcSession: input.call.session, agentSession: input.agentSession },
    base,
  );

  return fault ?? { kind: 'bound' };
}
