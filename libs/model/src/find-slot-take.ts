import invariant from 'tiny-invariant';
import type { RowWrite } from './types/ports.ts';

export type SlotTake = Extract<RowWrite, { op: 'take-slot' }>;

export function findSlotTake(writes: readonly RowWrite[]): SlotTake | null {
  const takes = writes.filter((write): write is SlotTake => write.op === 'take-slot');

  invariant(takes.length <= 1, 'a change takes one slot at most');

  return takes.at(0) ?? null;
}
