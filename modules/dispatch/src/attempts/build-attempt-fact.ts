import type { AnyNewFact, FactType, NewFact, WorkFacts } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import type { AttemptEvent, AttemptFactType, FactEnvelopeParts, MoveParts } from './types.ts';

// The fact of one type that a move records, filled from the move's event and rows.
export function buildAttemptFact(
  type: AttemptFactType,
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

  // the table of moves pairs each fact with its event, so another pair is a bug in it
  const event = <K extends AttemptEvent['kind']>(kind: K): Extract<AttemptEvent, { kind: K }> => {
    const moved = parts.event;

    invariant(isEventKind(moved, kind), `the move ${moved.kind} cannot record ${type}`);

    return moved;
  };

  return match(type)
    .with('boxxy.attempt.claimed', (factType) => {
      const claimed = event('claimed');

      return wrap(factType, {
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
      });
    })
    .with('boxxy.decision.recorded', (factType) => {
      invariant(parts.decision !== null, 'a move that records a decision carries one');

      return wrap(factType, parts.decision);
    })
    .with('boxxy.attempt.started', (factType) => {
      const started = event('started');

      return wrap(factType, {
        attempt,
        atcSession: started.atcSession,
        resumeFallback: started.resumeFallback,
        caller: started.caller,
      });
    })
    .with('boxxy.attempt.reconciled', (factType) => {
      const started = event('started');

      return wrap(factType, { attempt, atcSession: started.atcSession, caller: started.caller });
    })
    .with('boxxy.attempt.spawn_unanswered', (factType) =>
      wrap(factType, { attempt, reason: event('spawn-unanswered').reason }),
    )
    .with('boxxy.attempt.session_bound', (factType) => {
      const seen = event('session-seen');

      return wrap(factType, {
        attempt,
        atcSession: seen.row.atcSession,
        agentSession: seen.row.agentSession,
        product: seen.row.product,
        source: seen.row.source,
        seenAt: seen.row.seenAt,
      });
    })
    .with('boxxy.attempt.slept', (factType) => {
      const moved = parts.event;

      // the host refused the wake, so the attempt sleeps again from its earlier sleep
      if (moved.kind === 'wake-refused') {
        return wrap(factType, {
          attempt,
          idleSince: parts.before.sleptAt ?? envelope.now,
          asked: true,
        });
      }

      const slept = event('slept');

      return wrap(factType, { attempt, idleSince: slept.idleSince, asked: slept.asked });
    })
    .with('boxxy.attempt.wake_requested', (factType) =>
      wrap(factType, { attempt, by: event('wake-requested').by }),
    )
    .with('boxxy.attempt.woken', (factType) => {
      const woken = event('woken');

      return wrap(factType, {
        attempt,
        holdGen: after.holdGen,
        seats: woken.pick.limits.map((limit) => ({ limit })),
        overCap: woken.overCap,
      });
    })
    .with('boxxy.attempt.resumed', (factType) => {
      const resumed = event('resumed');

      return wrap(factType, { attempt, atcSession: resumed.atcSession, caller: resumed.caller });
    })
    .with('boxxy.attempt.closed_out', (factType) => {
      const closed = event('closed-out');

      return wrap(factType, {
        attempt,
        phase: after.phase,
        closeOut: closed.closeOut,
        hash: closed.hash,
      });
    })
    .with('boxxy.attempt.timed_out', (factType) =>
      wrap(factType, {
        attempt,
        phase: after.phase,
        afterMinutes: event('timed-out').afterMinutes,
      }),
    )
    .with('boxxy.attempt.turn_ended', (factType) => {
      event('turn-ended');

      return wrap(factType, { attempt, phase: after.phase });
    })
    .with('boxxy.attempt.settled', (factType) => {
      const settled = event('settled');

      return wrap(factType, {
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
      });
    })
    .exhaustive();
}

function isEventKind<K extends AttemptEvent['kind']>(
  event: AttemptEvent,
  kind: K,
): event is Extract<AttemptEvent, { kind: K }> {
  return event.kind === kind;
}
