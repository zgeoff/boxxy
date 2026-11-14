import type { ItemId } from '@boxxy/model';
import type { VerifyHarness } from './types.ts';

// Makes the item the current one. The item before it and its peers close, so a tick of the next
// journey claims nothing for them and the journeys run in any order on one run. With
// `keepPrevious`, the item before it stays open as a peer, for a journey that orders two items.
export async function setCurrentItem(
  harness: VerifyHarness,
  item: ItemId,
  keepPrevious: boolean,
): Promise<void> {
  const previous = harness.current;

  if (keepPrevious) {
    if (previous !== null && previous !== item) {
      harness.peers.push(previous);
    }
  } else {
    for (const open of [
      ...(previous === null || previous === item ? [] : [previous]),
      ...harness.peers,
    ]) {
      await harness.server.dispatch.closeItem(open, 'the next journey started');
    }

    harness.peers = [];
  }

  harness.current = item;
  harness.currentSince = harness.server.dispatch.clock.now();
}
