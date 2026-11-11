import { buildInitialSenderState, buildOutboxStatus } from '@boxxy/dispatch';
import type { ClaimStore, Clock } from '@boxxy/model';
import type { OutboxControl } from '../types.ts';

// The outbox of a server with no pepys section: the facts wait in the store, the status says
// `off`, and a nudge has no sender to wake.
export function createOffOutbox(store: ClaimStore, clock: Clock): OutboxControl {
  return {
    status: async () =>
      buildOutboxStatus({
        sink: 'none',
        state: buildInitialSenderState(),
        counts: await store.read((tx) => tx.readOutboxCounts()),
        now: clock.now(),
        isSending: false,
      }),
    nudge: () => {
      // no sender runs, so the facts wait in the store
    },
  };
}
