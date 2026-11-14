import type { ClaimStore, Notifier } from '@boxxy/model';
import type { SentNotice } from './types.ts';

// The notifier that the tick sends through in the harness. It does what the atc notifier does for
// the owner: it takes a notice only when a notice session is registered, and sends it to that
// session. The fake atc is the `sent` list.
export function createRecordingNotifier(store: ClaimStore, sent: SentNotice[]): Notifier {
  return {
    tellHold: async (notice) => {
      const session = await store.read((tx) => tx.readNoticeSession());

      if (session === null) {
        return { kind: 'refused', reason: 'no-notice-session' };
      }

      sent.push({ item: notice.item, reason: notice.reason, session: session.gatewayID });

      return { kind: 'sent' };
    },
  };
}
