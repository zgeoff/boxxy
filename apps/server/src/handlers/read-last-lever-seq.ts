import type { ItemId, StoreTx } from '@boxxy/model';
import type { ServerDeps } from '../types.ts';

// The item's newest lever is the one the change just wrote: the lock holds every other writer off.
export async function readLastLeverSeq(
  tx: StoreTx,
  deps: ServerDeps,
  item: ItemId,
): Promise<number> {
  const detail = await tx.readItemDetail(item, deps.clock.now(), deps.rulesState().rules);

  return Math.max(0, ...(detail?.item.levers.map((lever) => lever.seq) ?? []));
}
