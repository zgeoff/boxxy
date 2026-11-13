import type { ClaimStore } from '@boxxy/model';

// The notifier calls this on each try, so a session that the owner registers gets the next try of
// every notice that waits, with no restart of the server.
export function makeNoticeSessionRead(store: ClaimStore): () => Promise<string | null> {
  return async () => {
    const session = await store.read((tx) => tx.readNoticeSession());

    return session?.gatewayID ?? null;
  };
}
