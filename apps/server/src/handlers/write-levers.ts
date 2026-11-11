import type { ItemId, LeverRow, StoreTx } from '@boxxy/model';
import type { ServerDeps } from '../types.ts';
import { buildOwnerFact } from './build-owner-fact.ts';
import { readItemIds } from './read-item-ids.ts';

export type LeverDraft = Pick<LeverRow, 'kind' | 'until' | 'expiresAt' | 'reason' | 'phase'>;

export type LeverAnswer =
  | { readonly kind: 'recorded'; readonly levers: readonly number[] }
  | { readonly kind: 'not-found'; readonly item: string };

// Records one lever per item, in one change with one `boxxy.lever.recorded` each. The store
// numbers the levers; the answer reads the numbers back in the same lock.
export function writeLevers(
  deps: ServerDeps,
  items: readonly string[],
  draft: LeverDraft,
): Promise<LeverAnswer> {
  return deps.store.exclusive(async (tx) => {
    const now = deps.clock.now();

    const found = await readItemIds(tx, deps, items);

    if (found.kind === 'not-found') {
      return found;
    }

    const rows = found.items.map((item): LeverRow => ({
      ...draft,
      seq: 0,
      item,
      actor: 'boxxy:owner:local',
      at: now,
    }));

    await tx.applyChange({
      at: now,
      writes: rows.map((row) => ({ op: 'insert', table: 'levers', row }) as const),
      facts: rows.map((row) => buildOwnerFact(deps, row.item, 'boxxy.lever.recorded', row)),
    });

    const levers = await Promise.all(found.items.map((item) => readLastLeverSeq(tx, deps, item)));

    return { kind: 'recorded', levers };
  });
}

// The item's newest lever is the one this change wrote: the lock holds every other writer off.
async function readLastLeverSeq(tx: StoreTx, deps: ServerDeps, item: ItemId): Promise<number> {
  const detail = await tx.readItemDetail(item, deps.clock.now(), deps.rulesState().rules);

  return Math.max(0, ...(detail?.item.levers.map((lever) => lever.seq) ?? []));
}
