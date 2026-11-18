import { pickPausedNotice } from './pick-paused-notice.ts';
import type { QueuePausedNoticeInput } from './types.ts';

// Queues the owner's notice for a runner that has stayed paused with work ready, and marks the
// runner's row in the same change, so a later tick queues no second one. Returns whether it
// queued a notice.
export function writePausedNotice(input: QueuePausedNoticeInput): Promise<boolean> {
  return input.store.exclusive(async (tx) => {
    const runner = await tx.readRunner(input.runner);

    if (runner?.paused !== true) {
      return false;
    }

    const ready = await tx.listItems({ state: 'ready' }, input.now, input.rules);

    const draft = pickPausedNotice(runner, ready.length, input.now);

    if (draft === null) {
      return false;
    }

    // the store numbers each notice, so the ID here is replaced
    await tx.applyChange({
      at: input.now,
      writes: [
        {
          op: 'insert',
          table: 'notices',
          row: {
            id: 1,
            kind: 'runner-paused',
            item: null,
            reason: null,
            pause: draft,
            at: input.now,
            tries: 0,
            sentAt: null,
            keySeq: 0,
            keyTries: 0,
            nextTryAt: input.now,
          },
        },
        {
          op: 'update',
          table: 'runners',
          key: { id: input.runner },
          expect: { pauseNoticedAt: null },
          set: { pauseNoticedAt: input.now },
        },
      ],
      facts: [],
    });

    return true;
  });
}
