import type { ItemId } from '@boxxy/model';
import type { VerifyHarness } from './types.ts';

// Makes the item the current one. The item before it closes, so a tick of the next journey claims
// nothing for it and the three journeys run in any order on one run.
export async function setCurrentItem(harness: VerifyHarness, item: ItemId): Promise<void> {
  const previous = harness.current;

  if (previous !== null && previous !== item) {
    await harness.server.dispatch.closeItem(previous, 'the next journey started');
  }

  harness.current = item;
  harness.currentSince = harness.server.dispatch.clock.now();
}
