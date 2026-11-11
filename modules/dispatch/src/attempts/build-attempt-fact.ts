import type { AnyNewFact, FactType, NewFact, WorkFacts } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { P, match } from 'ts-pattern';
import type { FactEnvelopeParts, MoveParts } from './types.ts';

// The fact of one type that a move records, filled from the move's event and rows.
export function buildAttemptFact(
  type: FactType,
  parts: MoveParts,
  envelope: FactEnvelopeParts,
): AnyNewFact {
  const after = parts.after;
  const attempt = after.id;

  const wrap = <T extends FactType>(factType: T, payload: WorkFacts[T]): NewFact<T> => ({
    id: envelope.id,
    type: factType,
    entity: `boxxy:item:${after.item}`,
    actor: envelope.actor,
    payload,
  });

  return (
    match([type, parts.event] as const)
      .with(['boxxy.attempt.claimed', { kind: 'claimed' }], ([factType, claimed]) =>
        wrap(factType, {
          attempt,
          phase: after.phase,
          number: after.number,
          round: after.round,
          mode: after.mode,
          pool: after.pool,
          fields: after.fields,
          seats: claimed.pick.limits.map((limit) => ({ limit })),
          recipeHash: after.recipeHash,
          skillsRef: claimed.skillsRef,
          rulesVersion: after.rulesVersion,
        }),
      )
      .with(['boxxy.decision.recorded', P._], ([factType]) => {
        invariant(parts.decision !== null, 'a move that records a decision carries one');

        return wrap(factType, parts.decision);
      })
      .with(['boxxy.attempt.started', { kind: 'started' }], ([factType, started]) =>
        wrap(factType, {
          attempt,
          atcSession: started.atcSession,
          resumeFallback: started.resumeFallback,
          caller: started.caller,
        }),
      )
      .with(['boxxy.attempt.reconciled', { kind: 'started' }], ([factType, started]) =>
        wrap(factType, { attempt, atcSession: started.atcSession, caller: started.caller }),
      )
      .with(
        ['boxxy.attempt.spawn_unanswered', { kind: 'spawn-unanswered' }],
        ([factType, unanswered]) => wrap(factType, { attempt, reason: unanswered.reason }),
      )
      .with(['boxxy.attempt.session_bound', { kind: 'session-seen' }], ([factType, seen]) =>
        wrap(factType, {
          attempt,
          atcSession: seen.row.atcSession,
          agentSession: seen.row.agentSession,
          product: seen.row.product,
          source: seen.row.source,
          seenAt: seen.row.seenAt,
        }),
      )
      .with(['boxxy.attempt.slept', { kind: 'slept' }], ([factType, slept]) =>
        wrap(factType, { attempt, idleSince: slept.idleSince, asked: slept.asked }),
      )

      // the host refused the wake, so the attempt sleeps again from its earlier sleep
      .with(['boxxy.attempt.slept', { kind: 'wake-refused' }], ([factType]) =>
        wrap(factType, {
          attempt,
          idleSince: parts.before.sleptAt ?? envelope.now,
          asked: true,
        }),
      )
      .with(['boxxy.attempt.wake_requested', { kind: 'wake-requested' }], ([factType, wake]) =>
        wrap(factType, { attempt, by: wake.by }),
      )
      .with(['boxxy.attempt.woken', { kind: 'woken' }], ([factType, woken]) =>
        wrap(factType, {
          attempt,
          holdGen: after.holdGen,
          seats: woken.pick.limits.map((limit) => ({ limit })),
          overCap: woken.overCap,
        }),
      )
      .with(['boxxy.attempt.resumed', { kind: 'resumed' }], ([factType, resumed]) =>
        wrap(factType, { attempt, atcSession: resumed.atcSession, caller: resumed.caller }),
      )
      .with(['boxxy.attempt.closed_out', { kind: 'closed-out' }], ([factType, closed]) =>
        wrap(factType, {
          attempt,
          phase: after.phase,
          closeOut: closed.closeOut,
          hash: closed.hash,
        }),
      )
      .with(['boxxy.attempt.timed_out', { kind: 'timed-out' }], ([factType, timedOut]) =>
        wrap(factType, { attempt, phase: after.phase, afterMinutes: timedOut.afterMinutes }),
      )
      .with(['boxxy.attempt.turn_ended', { kind: 'turn-ended' }], ([factType]) =>
        wrap(factType, { attempt, phase: after.phase }),
      )
      .with(['boxxy.attempt.settled', { kind: 'settled' }], ([factType, settled]) =>
        wrap(factType, {
          attempt,
          phase: after.phase,
          round: after.round,
          state: settled.state,
          failure: settled.failure,
          outcome: settled.outcome,
          returnedOutcome: settled.returnedOutcome,
          closing: parts.before.closing,
          asleep: parts.before.state === 'sleeping',
          sessionStopped: settled.sessionStopped,
          endedAt: envelope.now,
          criteria: settled.criteria,
          matched: settled.matched,
          frictionDropped: settled.frictionDropped,
          skippedEffects: settled.skippedEffects,
        }),
      )

      // the table of moves pairs each fact with an event above, so another pair is a bug in it
      .otherwise(([factType, other]) => {
        throw new Error(`the move ${other.kind} cannot record ${factType}`);
      })
  );
}
