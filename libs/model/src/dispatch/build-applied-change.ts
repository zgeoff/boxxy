import type { AnyNewFact } from '../facts/types.ts';
import type { RowWrite, StoreChange } from '../ports/types.ts';

export interface ChangeAssignments {
  // 0 when the store holds no lever
  readonly lastLeverSeq: number;

  // 0 when the store holds no notice
  readonly lastNoticeId: number;
}

// The store numbers each lever and each notice, so the caller's `seq` and `id` are replaced.
export function buildAppliedChange(
  change: StoreChange,
  assignments: ChangeAssignments,
): Pick<StoreChange, 'writes' | 'facts'> {
  const leverSeqs: number[] = [];
  let notices = 0;

  const writes = change.writes.map((write): RowWrite => {
    if (write.op !== 'insert') {
      return write;
    }

    if (write.table === 'levers') {
      const seq = assignments.lastLeverSeq + leverSeqs.length + 1;

      leverSeqs.push(seq);

      return { ...write, row: { ...write.row, seq } };
    }

    if (write.table === 'notices') {
      notices += 1;

      return { ...write, row: { ...write.row, id: assignments.lastNoticeId + notices } };
    }

    return write;
  });

  let leverFacts = 0;

  const facts = change.facts.map((fact): AnyNewFact => {
    if (fact.type !== 'boxxy.lever.recorded') {
      return fact;
    }

    const seq = leverSeqs[leverFacts];

    leverFacts += 1;

    return seq === undefined ? fact : { ...fact, payload: { ...fact.payload, seq } };
  });

  return { writes, facts };
}
