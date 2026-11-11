import type { AttemptId, RowWrite, StoreTx } from '@boxxy/model';
import { buildAttemptChange } from './build-attempt-change.ts';
import type { AttemptGuard } from './is-same-guard.ts';
import { isSameGuard } from './is-same-guard.ts';
import type { MoveBase, MoveEvent, MoveResult } from './types.ts';

// Applies one move of the attempt as the store holds it inside `tx`, built from the row it
// changes. `also` rides in the same change. A row that moved on from `seen`, the row a caller
// decided on before the lock, refuses the move.
export async function writeAttemptMove(
  tx: StoreTx,
  attempt: AttemptId,
  event: MoveEvent,
  base: MoveBase & {
    readonly also?: readonly RowWrite[];
    readonly seen?: Partial<AttemptGuard>;
  },
): Promise<MoveResult> {
  const row = await tx.readAttempt(attempt);

  if (row === null) {
    return { kind: 'not-allowed' };
  }

  if (base.seen !== undefined && !isSameGuard(base.seen, row)) {
    return { kind: 'refused', reason: 'guard-mismatch' };
  }

  const built = buildAttemptChange({ ...base, attempt: row, event });

  if (built.kind === 'not-allowed') {
    return { kind: 'not-allowed' };
  }

  const result = await tx.applyChange({
    ...built.change,
    writes: [...built.change.writes, ...(base.also ?? [])],
  });

  return result.kind === 'applied' ? result : { kind: 'refused', reason: result.kind };
}
