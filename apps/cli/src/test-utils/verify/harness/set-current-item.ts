import type { ItemId, LoadedRules } from '@boxxy/model';
import type { VerifyHarness } from './types.ts';

// Makes the item the current one under the rules given, or the harness's rules. The item before
// it and its peers close, unless `keepPrevious` leaves the item before it open as a peer.
export async function setCurrentItem(
  harness: VerifyHarness,
  item: ItemId,
  keepPrevious: boolean,
  rules: LoadedRules = harness.baseRules,
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

  harness.server.dispatch.setRules(rules);

  harness.current = item;
  harness.currentSince = harness.server.dispatch.clock.now();
}
