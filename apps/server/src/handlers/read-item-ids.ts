import type { ItemId, StoreReader } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import type { ServerDeps } from '../types.ts';

export type ItemIdsAnswer =
  | { readonly kind: 'found'; readonly items: ItemId[] }

  // the first entry that names no stored item
  | { readonly kind: 'not-found'; readonly item: string };

// The IDs as the store holds them, in the order given. The wire carries plain strings.
export async function readItemIds(
  tx: StoreReader,
  deps: ServerDeps,
  raw: readonly string[],
): Promise<ItemIdsAnswer> {
  const items: ItemId[] = [];
  const rules = deps.rulesState().rules;

  for (const entry of raw) {
    const parsed = brandSchemas.itemId.safeParse(entry);

    if (!parsed.success || (await tx.readItem(parsed.data, deps.clock.now(), rules)) === null) {
      return { kind: 'not-found', item: entry };
    }

    items.push(parsed.data);
  }

  return { kind: 'found', items };
}
