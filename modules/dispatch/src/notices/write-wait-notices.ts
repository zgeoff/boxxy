import { collectWaitNotices } from './collect-wait-notices.ts';
import type { QueueWaitNoticesInput } from './types.ts';

// Queues the owner's notice for each item that has waited too long at a step, and marks the stay in
// the same change, so a later tick queues no second one and a refused mark drops its notice. The
// item keeps waiting. Returns how many notices it queued.
export function writeWaitNotices(input: QueueWaitNoticesInput): Promise<number> {
  return input.store.exclusive(async (tx) => {
    const waiting = await tx.listItems({ state: 'waiting' }, input.now, input.rules);
    const marks = await tx.listWaitNoticeMarks();

    const drafts = collectWaitNotices(waiting, input.rules, marks, input.now);

    for (const draft of drafts) {
      await tx.applyChange({
        at: input.now,
        writes: [
          {
            op: 'insert',
            table: 'notices',

            // the store numbers each notice, so the ID here is replaced
            row: {
              id: 1,
              kind: 'notify',
              item: draft.item,
              phase: draft.phase,
              reason: draft.reason,
              pause: null,
              at: input.now,
              tries: 0,
              sentAt: null,
              keySeq: 0,
              keyTries: 0,
              nextTryAt: input.now,
            },
          },
          {
            op: 'insert',
            table: 'wait_notices',
            row: { itemId: draft.item, since: draft.since, noticedAt: input.now },
          },
        ],
        facts: [],
      });
    }

    return drafts.length;
  });
}
