import type {
  ActorRef,
  AnyNewFact,
  AttemptId,
  AttemptRow,
  Instant,
  NewId,
  RowWrite,
  StoreChange,
} from '@boxxy/model';
import invariant from 'tiny-invariant';
import { buildAttemptChange } from './build-attempt-change.ts';
import type { MoveEvent } from './types.ts';

interface EndItemAttemptsInput {
  // the item's live attempts, read in the same lock as the close
  readonly attempts: readonly AttemptRow[];
  readonly actor: ActorRef;
  readonly now: Instant;
  readonly newId: NewId;
}

export interface EndedAttempts {
  // the lease of the item's live attempt; null when it has none
  readonly under: NonNullable<StoreChange['under']> | null;
  readonly writes: readonly RowWrite[];
  readonly facts: readonly AnyNewFact[];

  // what `boxxy.item.closed` lists
  readonly ended: readonly { readonly attempt: AttemptId; readonly how: 'settled' | 'closing' }[];
}

// The writes that the close of an item makes to its live attempts. A sleeping attempt settles
// at once, with no wake; a closing one is left as it is, for the runner to settle; any other
// moves to `closing` and keeps its seats until the runner stops its session.
export function endItemAttempts(input: EndItemAttemptsInput): EndedAttempts {
  const moves = input.attempts.flatMap((attempt) => {
    const event = pickEndEvent(attempt);

    if (event === null) {
      return [];
    }

    const built = buildAttemptChange({
      attempt,
      event,
      actor: input.actor,
      now: input.now,
      newId: input.newId,
    });

    invariant(built.kind === 'change', `a ${attempt.state} attempt can end with its item`);

    return [
      {
        change: built.change,
        ended: {
          attempt: attempt.id,
          how: event.kind === 'settled' ? 'settled' : 'closing',
        } as const,
      },
    ];
  });

  // an item stands at one phase, so it has one live attempt at most
  invariant(moves.length <= 1, 'an item has one live attempt at most');

  return {
    under: moves[0]?.change.under ?? null,
    writes: moves.flatMap((move) => move.change.writes),
    facts: moves.flatMap((move) => move.change.facts),
    ended: moves.map((move) => move.ended),
  };
}

function pickEndEvent(attempt: AttemptRow): MoveEvent | null {
  if (attempt.state === 'sleeping') {
    return {
      kind: 'settled',
      state: 'failed',
      failure: 'item-closed',
      outcome: 'lost',
      returnedOutcome: null,
      sessionStopped: true,
      criteria: [],
      matched: [],
      frictionDropped: 0,
      skippedEffects: [],
    };
  }

  return attempt.state === 'closing' || attempt.state === 'succeeded' || attempt.state === 'failed'
    ? null
    : { kind: 'item-closed' };
}
