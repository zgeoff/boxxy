import type { AttemptId, RowWrite, StoreTx } from '@boxxy/model';
import { buildAttemptChange } from './build-attempt-change.ts';
import type { MoveBase, MoveEvent, MoveResult } from './types.ts';

// Applies one move of the attempt as the store holds it inside `tx`. The read and the write
// share the lock, so the move is built from the row it changes. `also` rides in the same change.
export async function writeAttemptMove(
  tx: StoreTx,
  attempt: AttemptId,
  event: MoveEvent,
  base: MoveBase & { readonly also?: readonly RowWrite[] },
): Promise<MoveResult> {
  const row = await tx.readAttempt(attempt);

  if (row === null) {
    return { kind: 'not-allowed' };
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
