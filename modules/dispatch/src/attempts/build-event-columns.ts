import type { AttemptRow, FactId, Instant } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { P, match } from 'ts-pattern';
import { getActionMember } from './get-action-member.ts';
import type { AttemptFactType, MoveEvent } from './types.ts';

// The columns of the attempt row that hold a move's own data.
export function buildEventColumns(
  event: MoveEvent,
  attempt: AttemptRow,
  now: Instant,
  factIDs: ReadonlyMap<AttemptFactType, FactId>,
): Partial<AttemptRow> {
  return match(event)
    .with({ kind: 'started' }, (started) => ({
      atcSession: started.atcSession,
      caller: started.caller,
      startedAt: attempt.startedAt ?? now,
    }))
    .with({ kind: P.union('closed-out', 'job-finished') }, (closed) => ({
      closeOut: closed.closeOut,
      closeOutHash: closed.hash,
      closeOutFact: getFactID(factIDs, 'boxxy.attempt.closed_out'),
    }))
    .with({ kind: 'job-started' }, () => ({ startedAt: now }))
    .with({ kind: 'acted' }, (acted) => ({
      actedAt: now,
      actedHead: getActionMember(acted.action).head,
      actedAnswer: null,
      readAt: now,
    }))
    .with({ kind: 'answered' }, (answered) => ({ actedAnswer: answered.answer }))
    .with({ kind: 'waited' }, (waited) => ({ readAt: now, waitReason: waited.reason }))
    .with({ kind: 'slept' }, () => ({ sleptAt: now }))
    .with({ kind: 'woken' }, () => ({ wokenAt: now }))
    .with({ kind: 'resumed' }, (resumed) => ({
      atcSession: resumed.atcSession,
      caller: resumed.caller,
    }))
    .with({ kind: 'settled' }, (settled) => ({
      failure: settled.failure,
      outcome: settled.outcome,
      returnedOutcome: settled.returnedOutcome,
      endedAt: now,
    }))
    .with({ kind: 'stray-stopped' }, (stopped) =>
      attempt.atcSession === null && stopped.atcSession !== null
        ? { atcSession: stopped.atcSession }
        : {},
    )
    .with(
      {
        kind: P.union(
          'spawn-unanswered',
          'session-seen',
          'timed-out',
          'item-closed',
          'turn-ended',
          'stalled',
          'skill-missing',
          'usage-limited',
          'suspend-asked',
          'suspend-refused',
          'wake-requested',
          'wake-refused',
          'session-forgotten',
        ),
      },
      () => ({}),
    )
    .exhaustive();
}

function getFactID(factIDs: ReadonlyMap<AttemptFactType, FactId>, type: AttemptFactType): FactId {
  const id = factIDs.get(type);

  invariant(id !== undefined, `the move records ${type}`);

  return id;
}
