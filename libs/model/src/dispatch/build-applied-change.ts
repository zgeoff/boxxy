import type { RowWrite, StoreChange } from '../ports/types.ts';
import type { SliceOneAnyNewFact as AnyNewFact } from '../slice-one/types.ts';
import type { AttemptId, PoolName } from '../types.ts';

export interface TakenSlot {
  readonly holder: AttemptId;
  readonly pool: PoolName;
  readonly slot: number;
  readonly gen: number;
}

export interface ChangeAssignments {
  readonly taken: TakenSlot | null;

  // 0 when the store holds no lever
  readonly lastLeverSeq: number;
}

export function buildAppliedChange(
  change: StoreChange,
  assignments: ChangeAssignments,
): Pick<StoreChange, 'writes' | 'facts'> {
  const leverSeqs: number[] = [];

  const writes = change.writes.map((write): RowWrite => {
    if (write.op !== 'insert') {
      return write;
    }

    if (write.table === 'levers') {
      const seq = assignments.lastLeverSeq + leverSeqs.length + 1;

      leverSeqs.push(seq);

      return { ...write, row: { ...write.row, seq } };
    }

    if (write.table === 'attempts' && write.row.id === assignments.taken?.holder) {
      const taken = assignments.taken;

      return { ...write, row: { ...write.row, slot: taken.slot, slotGen: taken.gen } };
    }

    return write;
  });

  let leverFacts = 0;

  const facts = change.facts.map((fact): AnyNewFact => {
    if (fact.type === 'boxxy.lever.recorded') {
      const seq = leverSeqs[leverFacts];

      leverFacts += 1;

      return seq === undefined ? fact : { ...fact, payload: { ...fact.payload, seq } };
    }

    if (
      fact.type === 'boxxy.attempt.claimed' &&
      assignments.taken !== null &&
      fact.entity === `boxxy:attempt:${assignments.taken.holder}`
    ) {
      const taken = assignments.taken;

      return { ...fact, payload: { ...fact.payload, slot: taken.slot, gen: taken.gen } };
    }

    return fact;
  });

  return { writes, facts };
}
